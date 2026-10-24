-- Independent source evidence and immutable dated, revision-pinned assessments.
CREATE TABLE app.source_statements (
 workspace_id uuid NOT NULL REFERENCES app.workspaces(id), id uuid NOT NULL DEFAULT gen_random_uuid(),
 actor_id text NOT NULL DEFAULT app.current_actor_id(), created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 command_id uuid NOT NULL, source_revision integer NOT NULL CHECK(source_revision>0),
 account_id uuid NOT NULL, as_of timestamptz NOT NULL,
 document jsonb NOT NULL CHECK(jsonb_typeof(document)='object' AND octet_length(document::text)<=131072),
 PRIMARY KEY(workspace_id,id), UNIQUE(workspace_id,command_id),
 FOREIGN KEY(workspace_id,account_id) REFERENCES app.accounts(workspace_id,id),
 FOREIGN KEY(workspace_id,command_id) REFERENCES app.financial_commands(workspace_id,id) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX source_statements_account_time_idx ON app.source_statements(workspace_id,account_id,as_of,id);
CREATE TABLE app.statement_reconciliations (
 workspace_id uuid NOT NULL REFERENCES app.workspaces(id), id uuid NOT NULL DEFAULT gen_random_uuid(),
 actor_id text NOT NULL DEFAULT app.current_actor_id(), created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 command_id uuid NOT NULL, source_revision integer NOT NULL CHECK(source_revision>0),
 account_id uuid NOT NULL, as_of timestamptz NOT NULL, statement_id uuid NOT NULL,
 compared_revision integer NOT NULL CHECK(compared_revision>=0 AND compared_revision<source_revision),
 status text NOT NULL CHECK(status IN ('matched','variance','unavailable')),
 accepted boolean NOT NULL CHECK(NOT accepted OR status='matched'),
 result jsonb NOT NULL CHECK(jsonb_typeof(result)='object' AND octet_length(result::text)<=262144),
 PRIMARY KEY(workspace_id,id), UNIQUE(workspace_id,command_id),
 FOREIGN KEY(workspace_id,account_id) REFERENCES app.accounts(workspace_id,id),
 FOREIGN KEY(workspace_id,command_id) REFERENCES app.financial_commands(workspace_id,id) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(workspace_id,statement_id) REFERENCES app.source_statements(workspace_id,id)
);
CREATE INDEX statement_reconciliations_history_idx ON app.statement_reconciliations(workspace_id,statement_id,created_at,id);
--> statement-breakpoint
CREATE FUNCTION app.guard_statement_evidence() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE original app.source_statements; command app.financial_commands;
BEGIN
 SELECT * INTO command FROM app.financial_commands WHERE workspace_id=NEW.workspace_id AND id=NEW.command_id;
 IF command.source_revision IS DISTINCT FROM NEW.source_revision OR command.kind IS DISTINCT FROM
   (CASE WHEN TG_TABLE_NAME='source_statements' THEN 'statement.created' ELSE 'statement.evaluated' END) THEN
   RAISE EXCEPTION 'Statement evidence requires its atomic command revision' USING ERRCODE='23514';
 END IF;
 IF command.result->>'id' IS DISTINCT FROM NEW.id::text THEN
   RAISE EXCEPTION 'Statement command result must identify its source evidence' USING ERRCODE='23514';
 END IF;
 IF TG_TABLE_NAME='source_statements' THEN
   IF NEW.document->>'accountId' IS DISTINCT FROM NEW.account_id::text OR (NEW.document->>'asOf')::timestamptz IS DISTINCT FROM NEW.as_of THEN
     RAISE EXCEPTION 'Statement document scope must match its relational source' USING ERRCODE='23514';
   END IF;
 END IF;
 IF TG_TABLE_NAME='statement_reconciliations' THEN
   SELECT * INTO original FROM app.source_statements WHERE workspace_id=NEW.workspace_id AND id=NEW.statement_id;
   IF original.account_id IS DISTINCT FROM NEW.account_id OR original.as_of IS DISTINCT FROM NEW.as_of OR
      original.source_revision>NEW.compared_revision THEN
     RAISE EXCEPTION 'Reconciliation scope must match the available source statement' USING ERRCODE='23514';
   END IF;
 END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['source_statements','statement_reconciliations'] LOOP
  EXECUTE format('ALTER TABLE app.%I OWNER TO journal_migrator',t);
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY %I ON app.%I FOR SELECT TO journal_app USING(workspace_id=app.current_workspace_id() AND app.actor_role(workspace_id) IS NOT NULL)',t||'_read',t);
  EXECUTE format('CREATE POLICY %I ON app.%I FOR INSERT TO journal_app WITH CHECK(workspace_id=app.current_workspace_id() AND actor_id=app.current_actor_id() AND app.actor_role(workspace_id) IN (''owner'',''editor''))',t||'_insert',t);
  EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC',t);
  EXECUTE format('GRANT SELECT,INSERT ON app.%I TO journal_app',t);
  EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON app.%I FOR EACH ROW EXECUTE FUNCTION app.reject_accounting_history_mutation()',t||'_immutable',t);
  EXECUTE format('CREATE CONSTRAINT TRIGGER %I AFTER INSERT ON app.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.guard_statement_evidence()',t||'_source_guard',t);
 END LOOP;
END $$;
ALTER FUNCTION app.guard_statement_evidence() OWNER TO journal_migrator;
REVOKE ALL ON FUNCTION app.guard_statement_evidence() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.guard_statement_evidence() TO journal_app;
UPDATE app.schema_metadata SET version=10 WHERE singleton=true;
