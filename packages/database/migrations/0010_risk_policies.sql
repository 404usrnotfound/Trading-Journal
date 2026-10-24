-- Risk opinions are append-only evidence and never mutate financial source facts.
CREATE TABLE app.risk_policies (
 workspace_id uuid NOT NULL REFERENCES app.workspaces(id),id uuid NOT NULL DEFAULT gen_random_uuid(),account_id uuid,strategy_id uuid,actor_id text NOT NULL DEFAULT app.current_actor_id(),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(workspace_id,id),CHECK((account_id IS NULL)<>(strategy_id IS NULL)),FOREIGN KEY(workspace_id,account_id) REFERENCES app.accounts(workspace_id,id),FOREIGN KEY(workspace_id,strategy_id) REFERENCES app.strategies(workspace_id,id)
);
CREATE INDEX risk_policies_account ON app.risk_policies(workspace_id,account_id);
CREATE INDEX risk_policies_strategy ON app.risk_policies(workspace_id,strategy_id);
CREATE TABLE app.risk_policy_versions (
 workspace_id uuid NOT NULL,id uuid NOT NULL DEFAULT gen_random_uuid(),policy_id uuid NOT NULL,version integer NOT NULL CHECK(version>0),effective_at timestamptz NOT NULL,definition jsonb NOT NULL CHECK(jsonb_typeof(definition)='object' AND octet_length(definition::text)<=65536),reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 2000),actor_id text NOT NULL DEFAULT app.current_actor_id(),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(workspace_id,id),UNIQUE(workspace_id,policy_id,version),FOREIGN KEY(workspace_id,policy_id) REFERENCES app.risk_policies(workspace_id,id)
);
CREATE INDEX risk_policy_versions_effective ON app.risk_policy_versions(workspace_id,policy_id,effective_at);
CREATE TABLE app.risk_commands (
 workspace_id uuid NOT NULL REFERENCES app.workspaces(id),id uuid NOT NULL,request_hash text NOT NULL CHECK(request_hash~'^[0-9a-f]{64}$'),result jsonb NOT NULL CHECK(octet_length(result::text)<=1048576),actor_id text NOT NULL DEFAULT app.current_actor_id(),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(workspace_id,id)
);
CREATE TABLE app.risk_assessments (
 workspace_id uuid NOT NULL,id uuid NOT NULL DEFAULT gen_random_uuid(),account_id uuid NOT NULL,source_revision integer NOT NULL CHECK(source_revision>=0),as_of timestamptz NOT NULL,result jsonb NOT NULL CHECK(octet_length(result::text)<=1048576),actor_id text NOT NULL DEFAULT app.current_actor_id(),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(workspace_id,id),FOREIGN KEY(workspace_id,account_id) REFERENCES app.accounts(workspace_id,id)
);
CREATE INDEX risk_assessments_account ON app.risk_assessments(workspace_id,account_id,id);
CREATE TABLE app.risk_assessment_policies (
 workspace_id uuid NOT NULL,assessment_id uuid NOT NULL,policy_version_id uuid NOT NULL,actor_id text NOT NULL DEFAULT app.current_actor_id(),PRIMARY KEY(workspace_id,assessment_id,policy_version_id),FOREIGN KEY(workspace_id,assessment_id) REFERENCES app.risk_assessments(workspace_id,id),FOREIGN KEY(workspace_id,policy_version_id) REFERENCES app.risk_policy_versions(workspace_id,id)
);
--> statement-breakpoint
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['risk_policies','risk_policy_versions','risk_commands','risk_assessments','risk_assessment_policies'] LOOP
  EXECUTE format('ALTER TABLE app.%I OWNER TO journal_migrator',t);
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY %I ON app.%I FOR SELECT TO journal_app USING(workspace_id=app.current_workspace_id() AND app.actor_role(workspace_id) IS NOT NULL)',t||'_read',t);
  EXECUTE format('CREATE POLICY %I ON app.%I FOR INSERT TO journal_app WITH CHECK(workspace_id=app.current_workspace_id() AND actor_id=app.current_actor_id() AND app.actor_role(workspace_id) IN (''owner'',''editor''))',t||'_insert',t);
  EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC',t);
  EXECUTE format('GRANT SELECT,INSERT ON app.%I TO journal_app',t);
  EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON app.%I FOR EACH ROW EXECUTE FUNCTION app.reject_accounting_history_mutation()',t||'_immutable',t);
 END LOOP;
END $$;
UPDATE app.schema_metadata SET version=11 WHERE singleton=true;
