CREATE TABLE app.import_template_versions (
 workspace_id uuid NOT NULL REFERENCES app.workspaces(id),id uuid NOT NULL DEFAULT gen_random_uuid(),template_id uuid NOT NULL,version integer NOT NULL CHECK(version>0),name text NOT NULL CHECK(length(name) BETWEEN 1 AND 160),mapping jsonb NOT NULL CHECK(octet_length(mapping::text)<=65536),request_hash text NOT NULL,archived boolean NOT NULL DEFAULT false,actor_id text NOT NULL DEFAULT app.current_actor_id(),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(workspace_id,id),UNIQUE(workspace_id,template_id,version)
);
CREATE TABLE app.import_batches (
 workspace_id uuid NOT NULL REFERENCES app.workspaces(id),id uuid NOT NULL DEFAULT gen_random_uuid(),account_id uuid NOT NULL,namespace text NOT NULL CHECK(length(namespace) BETWEEN 1 AND 160),filename text NOT NULL CHECK(length(filename) BETWEEN 1 AND 160),source_text text NOT NULL CHECK(octet_length(source_text) BETWEEN 1 AND 2097152),file_hash text NOT NULL CHECK(file_hash=encode(sha256(convert_to(source_text,'UTF8')),'hex')),mapping jsonb NOT NULL CHECK(octet_length(mapping::text)<=65536),template_version_id uuid,adapter_id text NOT NULL,adapter_version text NOT NULL,revision integer NOT NULL DEFAULT 1 CHECK(revision>0),state text NOT NULL DEFAULT 'staged' CHECK(state IN ('staged','partial','committed','reversed')),row_count integer NOT NULL CHECK(row_count BETWEEN 1 AND 1000),preview jsonb,actor_id text NOT NULL DEFAULT app.current_actor_id(),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(workspace_id,id),FOREIGN KEY(workspace_id,account_id) REFERENCES app.accounts(workspace_id,id),FOREIGN KEY(workspace_id,template_version_id) REFERENCES app.import_template_versions(workspace_id,id)
);
CREATE TABLE app.import_rows (
 workspace_id uuid NOT NULL,id uuid NOT NULL DEFAULT gen_random_uuid(),batch_id uuid NOT NULL,row_number integer NOT NULL CHECK(row_number>0),source_key text NOT NULL,group_key text NOT NULL,source_id text,record_kind text,identity_key text, payload_hash text,payload jsonb,raw_fields jsonb NOT NULL,errors jsonb NOT NULL DEFAULT '[]',warnings jsonb NOT NULL DEFAULT '[]',status text NOT NULL CHECK(status IN ('ready','invalid','ambiguous','new','duplicate','correction','reconciled','committed','reversed')),result jsonb,recorded_command_id uuid,command_id uuid NOT NULL,actor_id text NOT NULL DEFAULT app.current_actor_id(),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(workspace_id,id),FOREIGN KEY(workspace_id,batch_id) REFERENCES app.import_batches(workspace_id,id),UNIQUE(workspace_id,batch_id,row_number),UNIQUE(workspace_id,command_id),FOREIGN KEY(workspace_id,recorded_command_id) REFERENCES app.financial_commands(workspace_id,id)
);
CREATE INDEX import_rows_batch ON app.import_rows(workspace_id,batch_id,row_number);
CREATE TABLE app.import_operations (
 workspace_id uuid NOT NULL,id uuid NOT NULL DEFAULT gen_random_uuid(),batch_id uuid NOT NULL,action text NOT NULL CHECK(action IN ('staged','previewed','committed','reversed')),idempotency_key uuid,request_hash text,details jsonb NOT NULL,actor_id text NOT NULL DEFAULT app.current_actor_id(),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(workspace_id,id),FOREIGN KEY(workspace_id,batch_id) REFERENCES app.import_batches(workspace_id,id),UNIQUE(workspace_id,idempotency_key)
);
CREATE INDEX import_history_time ON app.import_batches(workspace_id,created_at DESC,id DESC);
CREATE TABLE app.import_sources (
 workspace_id uuid NOT NULL,account_id uuid NOT NULL,namespace text NOT NULL,record_kind text NOT NULL,identity_key text NOT NULL,payload_hash text NOT NULL,current_row_id uuid NOT NULL,result jsonb NOT NULL,state text NOT NULL DEFAULT 'active' CHECK(state IN ('active','reversed')),actor_id text NOT NULL DEFAULT app.current_actor_id(),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(workspace_id,account_id,namespace,record_kind,identity_key),FOREIGN KEY(workspace_id,account_id) REFERENCES app.accounts(workspace_id,id),FOREIGN KEY(workspace_id,current_row_id) REFERENCES app.import_rows(workspace_id,id)
);
CREATE TABLE app.import_source_history (
 workspace_id uuid NOT NULL,id uuid NOT NULL DEFAULT gen_random_uuid(),operation_id uuid NOT NULL,row_id uuid NOT NULL,action text NOT NULL CHECK(action IN ('imported','corrected','reversed','duplicate','reconciled')),payload_hash text NOT NULL,result jsonb NOT NULL,actor_id text NOT NULL DEFAULT app.current_actor_id(),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(workspace_id,id),FOREIGN KEY(workspace_id,operation_id) REFERENCES app.import_operations(workspace_id,id),FOREIGN KEY(workspace_id,row_id) REFERENCES app.import_rows(workspace_id,id)
);
--> statement-breakpoint
CREATE FUNCTION app.guard_import_updates() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_TABLE_NAME='import_operations' AND (OLD.xmin::text::numeric<>mod(pg_current_xact_id()::text::numeric,4294967296) OR (to_jsonb(NEW)-'details') IS DISTINCT FROM (to_jsonb(OLD)-'details')) THEN RAISE EXCEPTION 'Completed import operations are immutable' USING ERRCODE='55000'; END IF;
 IF TG_TABLE_NAME='import_batches' AND (to_jsonb(NEW)-ARRAY['revision','state','preview']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['revision','state','preview']) THEN RAISE EXCEPTION 'Import source and mapping are immutable' USING ERRCODE='55000'; END IF;
 IF TG_TABLE_NAME='import_rows' AND (to_jsonb(OLD)->>'recorded_command_id') IS NOT NULL AND (to_jsonb(OLD)->>'recorded_command_id') IS DISTINCT FROM (to_jsonb(NEW)->>'recorded_command_id') THEN RAISE EXCEPTION 'Recorded import command is immutable' USING ERRCODE='55000'; END IF;
 IF TG_TABLE_NAME='import_rows' AND (to_jsonb(NEW)-ARRAY['status','result','recorded_command_id']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','result','recorded_command_id']) THEN RAISE EXCEPTION 'Import row provenance is immutable' USING ERRCODE='55000'; END IF;
 IF TG_TABLE_NAME='import_sources' AND (to_jsonb(NEW)-ARRAY['payload_hash','current_row_id','result','state']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['payload_hash','current_row_id','result','state']) THEN RAISE EXCEPTION 'Import source identity is immutable' USING ERRCODE='55000'; END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['import_template_versions','import_batches','import_rows','import_operations','import_sources','import_source_history'] LOOP
  EXECUTE format('ALTER TABLE app.%I OWNER TO journal_migrator',t);
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY %I ON app.%I FOR SELECT TO journal_app USING(workspace_id=app.current_workspace_id() AND app.actor_role(workspace_id) IS NOT NULL)',t||'_read',t);
  EXECUTE format('CREATE POLICY %I ON app.%I FOR INSERT TO journal_app WITH CHECK(workspace_id=app.current_workspace_id() AND actor_id=app.current_actor_id() AND app.actor_role(workspace_id) IN (''owner'',''editor''))',t||'_insert',t);
  EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC',t);EXECUTE format('GRANT SELECT,INSERT ON app.%I TO journal_app',t);
  IF t IN ('import_batches','import_rows','import_sources','import_operations') THEN
   EXECUTE format('CREATE POLICY %I ON app.%I FOR UPDATE TO journal_app USING(workspace_id=app.current_workspace_id() AND app.actor_role(workspace_id) IN (''owner'',''editor'')) WITH CHECK(workspace_id=app.current_workspace_id() AND app.actor_role(workspace_id) IN (''owner'',''editor''))',t||'_update',t);
   EXECUTE format('GRANT UPDATE ON app.%I TO journal_app',t);
   EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON app.%I FOR EACH ROW EXECUTE FUNCTION app.guard_import_updates()',t||'_update_guard',t);
  ELSE EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON app.%I FOR EACH ROW EXECUTE FUNCTION app.reject_accounting_history_mutation()',t||'_immutable',t); END IF;
 END LOOP;
END $$;
ALTER FUNCTION app.guard_import_updates() OWNER TO journal_migrator;
REVOKE ALL ON FUNCTION app.guard_import_updates() FROM PUBLIC;
-- Generic command provenance is transaction-local, independently of broker formats.
DO $$ DECLARE t text;
BEGIN
 FOR t IN SELECT table_name FROM information_schema.columns WHERE table_schema='app' AND column_name='origin' LOOP
  EXECUTE format('ALTER TABLE app.%I ALTER COLUMN origin SET DEFAULT coalesce(nullif(current_setting(''app.source_origin'',true),''''),''manual'')',t);
 END LOOP;
END $$;
UPDATE app.schema_metadata SET version=9 WHERE singleton=true;
