-- Additive platform-only upgrade: preserve all existing rows, RLS, and grants.
-- An invalid historical identifier fails migration; it is never rewritten.
ALTER TYPE app.membership_role OWNER TO journal_migrator;
ALTER TABLE app.workspaces ADD CONSTRAINT workspace_id_uuid_v4
  CHECK (id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$');
ALTER TABLE app.user_preferences ADD CONSTRAINT preference_id_uuid_v4
  CHECK (id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$');
ALTER TABLE app.audit_events ADD CONSTRAINT audit_id_uuid_v4
  CHECK (id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$');
ALTER TABLE app.workspaces ADD COLUMN revision integer NOT NULL DEFAULT 1
  CONSTRAINT workspace_positive_revision CHECK (revision >= 1);
GRANT UPDATE (revision) ON app.workspaces TO journal_app;
--> statement-breakpoint
-- Return contracts change only through a reviewed atomic migration. Reapply
-- pinned ownership/grants because dropping a function removes its old ACL.
DROP FUNCTION app.list_own_workspaces();
CREATE FUNCTION app.list_own_workspaces()
RETURNS TABLE (id uuid, name text, is_demo boolean, membership_role app.membership_role, timezone text, reporting_currency text, revision integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS $$
  SELECT w.id, w.name, w.is_demo, m.role, w.timezone, w.reporting_currency, w.revision
  FROM app.workspaces AS w JOIN app.workspace_memberships AS m ON m.workspace_id = w.id
  WHERE m.user_id = app.current_actor_id()
  ORDER BY w.is_demo, w.created_at, w.id
$$;
DROP FUNCTION app.create_personal_workspace(text, uuid, boolean);
CREATE FUNCTION app.create_personal_workspace(workspace_name text, workspace_uuid uuid, demo boolean DEFAULT false)
RETURNS TABLE (id uuid, name text, is_demo boolean, membership_role app.membership_role, timezone text, reporting_currency text, revision integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE actor text := app.current_actor_id();
BEGIN
  IF actor IS NULL OR NOT EXISTS (SELECT 1 FROM auth."user" AS u WHERE u.id = actor) THEN
    RAISE EXCEPTION 'Authenticated actor required' USING ERRCODE = '42501';
  END IF;
  IF workspace_uuid IS NULL OR workspace_name IS NULL OR char_length(btrim(workspace_name)) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'Invalid workspace fields' USING ERRCODE = '22023';
  END IF;
  INSERT INTO app.workspaces(id, name, created_by, is_demo) VALUES (workspace_uuid, btrim(workspace_name), actor, demo);
  INSERT INTO app.workspace_memberships(workspace_id, user_id, role) VALUES (workspace_uuid, actor, 'owner');
  INSERT INTO app.audit_events(workspace_id, actor_id, action) VALUES (workspace_uuid, actor, 'workspace.created');
  RETURN QUERY SELECT w.id, w.name, w.is_demo, 'owner'::app.membership_role, w.timezone, w.reporting_currency, w.revision
    FROM app.workspaces AS w WHERE w.id = workspace_uuid;
END $$;
ALTER FUNCTION app.list_own_workspaces() OWNER TO journal_migrator;
ALTER FUNCTION app.create_personal_workspace(text, uuid, boolean) OWNER TO journal_migrator;
REVOKE ALL ON FUNCTION app.list_own_workspaces(), app.create_personal_workspace(text, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.list_own_workspaces(), app.create_personal_workspace(text, uuid, boolean) TO journal_app;
--> statement-breakpoint
CREATE TABLE auth.security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() CONSTRAINT security_event_id_uuid_v4
    CHECK (id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  actor_id text,
  subject_user_id text NOT NULL CONSTRAINT security_event_subject_length
    CHECK (char_length(subject_user_id) BETWEEN 1 AND 128),
  action text NOT NULL CONSTRAINT security_event_action_length CHECK (char_length(action) BETWEEN 1 AND 120),
  request_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX security_event_subject_time_idx ON auth.security_events(subject_user_id, created_at, id);
ALTER TABLE auth.security_events OWNER TO journal_migrator;
REVOKE ALL ON auth.security_events FROM PUBLIC;
GRANT SELECT, INSERT ON auth.security_events TO journal_auth;
--> statement-breakpoint
UPDATE app.schema_metadata SET version = 2 WHERE singleton = true;
