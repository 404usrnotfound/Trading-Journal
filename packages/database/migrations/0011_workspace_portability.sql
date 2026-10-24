-- Portable application records, never authentication rows or imported permissions.
ALTER TABLE app.workspaces ADD COLUMN restored_from_workspace_id uuid;
DROP INDEX app.one_personal_workspace_per_creator;
CREATE UNIQUE INDEX one_personal_workspace_per_creator ON app.workspaces(created_by)
  WHERE NOT is_demo AND restored_from_workspace_id IS NULL;

CREATE TABLE app.portable_restore_history (
  workspace_id uuid NOT NULL REFERENCES app.workspaces(id),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  source_workspace_id uuid NOT NULL,
  archive_sha256 text NOT NULL CHECK(archive_sha256 ~ '^[a-f0-9]{64}$'),
  source_manifest jsonb NOT NULL,
  actor_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(workspace_id,id)
);
CREATE TABLE app.portable_restore_requests (
  workspace_id uuid NOT NULL REFERENCES app.workspaces(id),
  command_id uuid NOT NULL,
  actor_id text NOT NULL,
  archive_sha256 text NOT NULL CHECK(archive_sha256 ~ '^[a-f0-9]{64}$'),
  target_workspace_id uuid NOT NULL REFERENCES app.workspaces(id),
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(workspace_id,command_id)
);
ALTER TABLE app.portable_restore_history OWNER TO journal_migrator;
ALTER TABLE app.portable_restore_requests OWNER TO journal_migrator;
ALTER TABLE app.portable_restore_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.portable_restore_history FORCE ROW LEVEL SECURITY;
ALTER TABLE app.portable_restore_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.portable_restore_requests FORCE ROW LEVEL SECURITY;
REVOKE ALL ON app.portable_restore_history,app.portable_restore_requests FROM PUBLIC;
CREATE POLICY portable_restore_history_read ON app.portable_restore_history FOR SELECT TO journal_app
 USING(workspace_id=app.current_workspace_id() AND app.actor_role(workspace_id) IS NOT NULL);
CREATE POLICY portable_restore_requests_read ON app.portable_restore_requests FOR SELECT TO journal_app
 USING(workspace_id=app.current_workspace_id() AND actor_id=app.current_actor_id() AND app.actor_role(workspace_id)='owner');
GRANT SELECT ON app.portable_restore_history,app.portable_restore_requests TO journal_app;

--> statement-breakpoint
-- The closed allowlist is duplicated in the application and asserted by export/restore.
CREATE FUNCTION app.portable_workspace_tables() RETURNS TABLE(name text)
LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT item FROM unnest(ARRAY[
 'audit_events','financial_state','currencies','currency_convention_versions','brokers',
 'accounts','account_settings_versions','cash_buckets','instruments','instrument_versions',
 'trades','trade_legs','orders','order_legs','order_revisions','financial_commands','executions',
 'opening_lots','fees','cash_movements','fx_conversions','ledger_events','postings','holding_books',
 'positions','lots','lot_matches','allocation_sets','allocation_items','cost_attribution_sets',
 'cost_allocations','execution_supersessions','fx_observations','price_observations','outbox_events',
 'holding_transfers','inventory_events','trade_closures','account_valuation_observations','strategies',
 'strategy_attachments','strategy_commands','strategy_version_attachments','strategy_versions',
 'trade_strategy_links','journal_commands','journal_entries','journal_plan_attachments',
 'journal_plan_commitments','journal_plan_versions','journal_revision_attachments','journal_revisions',
 'journal_risk_additions','account_cash_events','cash_transfer_receipts','cash_transfers',
 'portfolio_version_accounts','portfolio_versions','portfolios','import_template_versions',
 'import_batches','import_rows','import_operations','import_sources','import_source_history',
 'portable_restore_history','source_statements','statement_reconciliations','risk_policies',
 'risk_policy_versions','risk_commands','risk_assessments','risk_assessment_policies'
 ]::text[]) item WHERE to_regclass(format('app.%I',item)) IS NOT NULL ORDER BY item
$$;
ALTER FUNCTION app.portable_workspace_tables() OWNER TO journal_migrator;
REVOKE ALL ON FUNCTION app.portable_workspace_tables() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.portable_workspace_tables() TO journal_app;

--> statement-breakpoint
-- Lifecycle admission is different from restoring immutable history. Only the
-- non-login migration owner while inside the reviewed SECURITY DEFINER restore
-- can take this exception. journal_app cannot impersonate that owner. An app
-- session setting this flag alone still executes every ordinary guard. All
-- deferred validation/conservation/FK triggers remain enabled and execute below.
DO $$
DECLARE guard record; definition text;
BEGIN
 FOR guard IN
  SELECT t.tgname,c.relname,pg_get_triggerdef(t.oid,true) AS definition
  FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='app' AND NOT t.tgisinternal AND (t.tgtype & 2)=2 AND (t.tgtype & 1)=1 AND (t.tgtype & 4)=4
    AND c.relname IN(SELECT name FROM app.portable_workspace_tables())
 LOOP
  IF position(' WHEN ' IN guard.definition)>0 THEN
   RAISE EXCEPTION 'Review existing lifecycle trigger condition before adding portability';
  END IF;
  definition:=replace(guard.definition,' EXECUTE FUNCTION ',
   ' WHEN (current_user <> ''journal_migrator'' OR current_setting(''app.portable_restore_workspace'',true) IS DISTINCT FROM NEW.workspace_id::text) EXECUTE FUNCTION ');
  EXECUTE format('DROP TRIGGER %I ON app.%I',guard.tgname,guard.relname);
  EXECUTE definition;
 END LOOP;
END $$;

--> statement-breakpoint
CREATE FUNCTION app.restore_portable_workspace(target_workspace uuid,workspace_name text,command_uuid uuid,archive_hash text,document jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor text:=app.current_actor_id(); initiating_workspace uuid:=app.current_workspace_id();
 source_workspace uuid:=(document->'sourceWorkspace'->>'id')::uuid; previous app.portable_restore_requests%ROWTYPE;
 remaining text[]; inserted text[]:=ARRAY[]::text[]; selected_table text; columns text; selected_values text;
 collection jsonb; candidate jsonb; record_count integer:=0; row_count integer; result jsonb;
 retained_revision integer; replayed_revision integer:=0;
BEGIN
 IF session_user IS DISTINCT FROM 'journal_app' OR actor IS NULL OR initiating_workspace IS NULL OR app.actor_role(initiating_workspace) IS DISTINCT FROM 'owner' THEN
  RAISE EXCEPTION 'Current authenticated workspace owner required' USING ERRCODE='42501';
 END IF;
 IF target_workspace IS NULL OR source_workspace IS NULL OR workspace_name IS NULL OR archive_hash IS NULL OR document IS NULL
  OR jsonb_typeof(document) IS DISTINCT FROM 'object'
  OR target_workspace::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  OR command_uuid IS NULL OR command_uuid::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  OR char_length(btrim(workspace_name)) NOT BETWEEN 1 AND 120 OR archive_hash !~ '^[a-f0-9]{64}$'
  OR document->>'format' IS DISTINCT FROM 'journal-workspace/1' OR (document->>'schemaVersion')::integer IS DISTINCT FROM (SELECT version FROM app.schema_metadata WHERE singleton)
  OR archive_hash IS DISTINCT FROM document->>'sha256'
  OR document->'calculationManifest' IS DISTINCT FROM jsonb_build_object('kernel','journal-financial-kernel/1','ordinaryLinear','cash-paid-ordinary-linear/1','lotMatching','fifo-average-specific/1','allocation','largest-remainder-scale36-stable-id/1','fxSelection','explicit-direct-inverse-no-future/1','precision','decimal160-half-even-numeric78-36/1','schema','financial-ledger/1')
  OR jsonb_typeof(document->'tables') IS DISTINCT FROM 'array' OR octet_length(document::text)>67108864 THEN
  RAISE EXCEPTION 'Invalid portable workspace envelope' USING ERRCODE='22023';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('portable-restore:'||initiating_workspace::text||':'||command_uuid::text,0));
 SELECT * INTO previous FROM app.portable_restore_requests WHERE workspace_id=initiating_workspace AND command_id=command_uuid;
 IF FOUND THEN
  IF previous.actor_id IS DISTINCT FROM actor OR previous.archive_sha256<>archive_hash THEN
   RAISE EXCEPTION 'Restore command already has different contents' USING ERRCODE='23505';
  END IF;
  RETURN previous.result;
 END IF;
 IF EXISTS(SELECT 1 FROM app.workspaces WHERE id=target_workspace) THEN
  RAISE EXCEPTION 'Restore requires a new empty workspace namespace' USING ERRCODE='23505';
 END IF;
 IF (SELECT count(*) FROM jsonb_array_elements(document->'tables'))<>(SELECT count(*) FROM app.portable_workspace_tables())
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(document->'tables') t WHERE jsonb_typeof(t) IS DISTINCT FROM 'object' OR t->>'name' IS NULL OR t->>'name' NOT IN(SELECT name FROM app.portable_workspace_tables()))
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(document->'tables') t GROUP BY t->>'name' HAVING count(*)<>1) THEN
  RAISE EXCEPTION 'Archive must contain exactly the supported application collections' USING ERRCODE='22023';
 END IF;
 FOR collection IN SELECT value FROM jsonb_array_elements(document->'tables') LOOP
  IF jsonb_typeof(collection->'rows') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid archive rows' USING ERRCODE='22023'; END IF;
  record_count:=record_count+jsonb_array_length(collection->'rows');
  IF record_count>100000 THEN RAISE EXCEPTION 'Portable record budget exceeded' USING ERRCODE='54000'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(collection->'rows') r WHERE r->>'workspace_id' IS DISTINCT FROM source_workspace::text) THEN
   RAISE EXCEPTION 'Archive contains foreign-workspace records' USING ERRCODE='42501';
  END IF;
 END LOOP;
 INSERT INTO app.workspaces(id,name,created_by,is_demo,timezone,reporting_currency,restored_from_workspace_id)
 VALUES(target_workspace,btrim(workspace_name),actor,false,document->'sourceWorkspace'->>'timezone',document->'sourceWorkspace'->>'reportingCurrency',source_workspace);
 INSERT INTO app.workspace_memberships(workspace_id,user_id,role) VALUES(target_workspace,actor,'owner');
 PERFORM set_config('app.workspace_id',target_workspace::text,true);
 PERFORM set_config('app.portable_restore_workspace',target_workspace::text,true);
 SET CONSTRAINTS ALL DEFERRED;
 SELECT array_agg(name ORDER BY name) INTO remaining FROM app.portable_workspace_tables();
 WHILE cardinality(remaining)>0 LOOP
  -- Topologically order ordinary FKs; deferred cycles are checked atomically at completion.
  SELECT name INTO selected_table FROM unnest(remaining) name WHERE NOT EXISTS(
   SELECT 1 FROM pg_constraint f JOIN pg_class parent ON parent.oid=f.confrelid
   WHERE f.contype='f' AND NOT f.condeferrable AND f.conrelid=to_regclass(format('app.%I',name))
    AND parent.relnamespace='app'::regnamespace AND parent.relname=ANY(remaining) AND parent.relname<>name
  ) AND (name<>'financial_commands' OR
    NOT ('outbox_events'=ANY(remaining)) AND NOT ('audit_events'=ANY(remaining)) AND NOT ('financial_state'=ANY(remaining)))
  ORDER BY name LIMIT 1;
  IF selected_table IS NULL THEN RAISE EXCEPTION 'Unsupported nondeferred restore dependency cycle'; END IF;
  SELECT value INTO collection FROM jsonb_array_elements(document->'tables') WHERE value->>'name'=selected_table;
  SELECT string_agg(format('%I',a.attname),',' ORDER BY a.attnum),string_agg(format('(r).%I',a.attname),',' ORDER BY a.attnum)
   INTO columns,selected_values FROM pg_attribute a WHERE a.attrelid=to_regclass(format('app.%I',selected_table)) AND a.attnum>0 AND NOT a.attisdropped AND a.attgenerated='';
  IF selected_table='financial_commands' THEN
   SELECT revision INTO retained_revision FROM app.financial_state WHERE workspace_id=target_workspace;
   -- Keep the existing command integrity trigger unchanged. Validate each retained
   -- command against its own state revision and its original audit/outbox evidence.
   SET CONSTRAINTS app.financial_command_complete IMMEDIATE;
  END IF;
  FOR candidate IN SELECT value FROM jsonb_array_elements(collection->'rows') ORDER BY
    CASE WHEN selected_table='financial_commands' THEN (value->>'source_revision')::integer
      ELSE COALESCE((value->>'version')::integer,(value->>'revision')::integer,0) END,
    value->>'created_at',value->>'id' LOOP
   candidate:=jsonb_set(candidate,'{workspace_id}',to_jsonb(target_workspace::text));
   -- Application has already rebound nested explicit workspace keys and verified hashes.
   IF selected_table='financial_commands' THEN
    IF (candidate->>'source_revision')::integer IS DISTINCT FROM replayed_revision+1 THEN
     RAISE EXCEPTION 'Portable financial command history must be contiguous' USING ERRCODE='23514';
    END IF;
    replayed_revision:=(candidate->>'source_revision')::integer;
    UPDATE app.financial_state SET revision=replayed_revision WHERE workspace_id=target_workspace;
   END IF;
   EXECUTE format('INSERT INTO app.%I(%s) SELECT %s FROM (SELECT jsonb_populate_record(NULL::app.%I,$1) AS r) input',selected_table,columns,selected_values,selected_table) USING candidate;
  END LOOP;
  IF selected_table='financial_commands' THEN
   IF retained_revision IS NOT NULL AND retained_revision IS DISTINCT FROM replayed_revision THEN
    RAISE EXCEPTION 'Portable financial state must match its complete command history' USING ERRCODE='23514';
   END IF;
   SET CONSTRAINTS app.financial_command_complete DEFERRED;
  END IF;
  inserted:=array_append(inserted,selected_table); remaining:=array_remove(remaining,selected_table);
 END LOOP;
 INSERT INTO app.portable_restore_history(workspace_id,id,source_workspace_id,archive_sha256,source_manifest,actor_id)
 VALUES(target_workspace,gen_random_uuid(),source_workspace,archive_hash,jsonb_build_object('sourceWorkspace',document->'sourceWorkspace','calculationManifest',document->'calculationManifest','schemaVersion',document->'schemaVersion'),actor);
 INSERT INTO app.audit_events(workspace_id,actor_id,action) VALUES(target_workspace,actor,'workspace.portable-restored');
 SET CONSTRAINTS ALL IMMEDIATE;
 SET CONSTRAINTS ALL DEFERRED;
 PERFORM set_config('app.portable_restore_workspace','',true);
 result:=jsonb_build_object('workspaceId',target_workspace,'name',btrim(workspace_name),'sourceWorkspaceId',source_workspace,'archiveSha256',archive_hash,'verified',true);
 INSERT INTO app.portable_restore_requests(workspace_id,command_id,actor_id,archive_sha256,target_workspace_id,result)
 VALUES(initiating_workspace,command_uuid,actor,archive_hash,target_workspace,result);
 RETURN result;
END $$;
ALTER FUNCTION app.restore_portable_workspace(uuid,text,uuid,text,jsonb) OWNER TO journal_migrator;
REVOKE ALL ON FUNCTION app.restore_portable_workspace(uuid,text,uuid,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.restore_portable_workspace(uuid,text,uuid,text,jsonb) TO journal_app;

UPDATE app.schema_metadata SET version=12 WHERE singleton=true;
