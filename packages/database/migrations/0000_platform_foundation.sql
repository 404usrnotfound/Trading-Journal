-- Reviewed platform migration. No trading, ledger, instrument or financial tables.
-- Runtime credentials are provisioned separately, never included in this file.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'journal_migrator') THEN
    CREATE ROLE journal_migrator NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'journal_app') THEN
    CREATE ROLE journal_app NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'journal_auth') THEN
    CREATE ROLE journal_auth NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'journal_jobs') THEN
    CREATE ROLE journal_jobs NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END $$;
--> statement-breakpoint
CREATE SCHEMA auth AUTHORIZATION journal_migrator;
CREATE SCHEMA app AUTHORIZATION journal_migrator;
CREATE SCHEMA queue AUTHORIZATION journal_migrator;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON SCHEMA app, auth, queue FROM PUBLIC;
GRANT USAGE ON SCHEMA app TO journal_app;
GRANT USAGE ON SCHEMA auth TO journal_auth;
GRANT USAGE ON SCHEMA queue TO journal_jobs;
ALTER DEFAULT PRIVILEGES FOR ROLE journal_migrator IN SCHEMA app REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE journal_migrator IN SCHEMA auth REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
--> statement-breakpoint
CREATE TABLE auth."user" (
  id text PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL CONSTRAINT user_email_unique UNIQUE,
  email_verified boolean NOT NULL DEFAULT false,
  image text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE auth.session (
  id text PRIMARY KEY,
  token text NOT NULL CONSTRAINT session_token_unique UNIQUE,
  user_id text NOT NULL CONSTRAINT session_user_id_user_id_fk REFERENCES auth."user"(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX session_user_idx ON auth.session(user_id);
CREATE TABLE auth.account (
  id text PRIMARY KEY,
  provider_id text NOT NULL,
  account_id text NOT NULL,
  user_id text NOT NULL CONSTRAINT account_user_id_user_id_fk REFERENCES auth."user"(id) ON DELETE CASCADE,
  password text,
  access_token text,
  refresh_token text,
  id_token text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  scope text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX account_user_idx ON auth.account(user_id);
CREATE UNIQUE INDEX account_provider_identity_idx ON auth.account(provider_id, account_id);
CREATE TABLE auth.verification (
  id text PRIMARY KEY,
  identifier text NOT NULL,
  value text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX verification_identifier_idx ON auth.verification(identifier);
CREATE TABLE auth.rate_limit (
  id text PRIMARY KEY,
  key text NOT NULL CONSTRAINT rate_limit_key_unique UNIQUE,
  count integer NOT NULL CONSTRAINT rate_limit_count_nonnegative CHECK (count >= 0),
  last_request bigint NOT NULL CONSTRAINT rate_limit_milliseconds_safe CHECK (last_request >= 0 AND last_request <= 9007199254740991)
);
--> statement-breakpoint
CREATE TYPE app.membership_role AS ENUM ('owner', 'editor', 'viewer');
CREATE TABLE app.workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CONSTRAINT workspace_name_length CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  created_by text NOT NULL CONSTRAINT workspaces_created_by_user_id_fk REFERENCES auth."user"(id),
  is_demo boolean NOT NULL DEFAULT false,
  timezone text NOT NULL DEFAULT 'UTC',
  reporting_currency text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX one_personal_workspace_per_creator ON app.workspaces(created_by) WHERE NOT is_demo;
CREATE TABLE app.workspace_memberships (
  workspace_id uuid NOT NULL CONSTRAINT workspace_memberships_workspace_id_workspaces_id_fk REFERENCES app.workspaces(id) ON DELETE CASCADE,
  user_id text NOT NULL CONSTRAINT workspace_memberships_user_id_user_id_fk REFERENCES auth."user"(id) ON DELETE CASCADE,
  role app.membership_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspace_memberships_workspace_id_user_id_pk PRIMARY KEY (workspace_id, user_id)
);
CREATE INDEX membership_user_idx ON app.workspace_memberships(user_id, workspace_id);
CREATE TABLE app.user_preferences (
  workspace_id uuid NOT NULL CONSTRAINT user_preferences_workspace_id_workspaces_id_fk REFERENCES app.workspaces(id) ON DELETE CASCADE,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  theme text NOT NULL DEFAULT 'system' CONSTRAINT preference_theme_values CHECK (theme IN ('system', 'light', 'dark')),
  timezone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_preferences_workspace_id_id_pk PRIMARY KEY (workspace_id, id),
  CONSTRAINT preference_membership_fk FOREIGN KEY (workspace_id, user_id)
    REFERENCES app.workspace_memberships(workspace_id, user_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX preference_member_idx ON app.user_preferences(workspace_id, user_id);
CREATE TABLE app.audit_events (
  workspace_id uuid NOT NULL CONSTRAINT audit_events_workspace_id_workspaces_id_fk REFERENCES app.workspaces(id) ON DELETE CASCADE,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  actor_id text NOT NULL,
  action text NOT NULL CONSTRAINT audit_action_length CHECK (char_length(action) BETWEEN 1 AND 120),
  request_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT audit_events_workspace_id_id_pk PRIMARY KEY (workspace_id, id)
);
CREATE INDEX audit_workspace_time_idx ON app.audit_events(workspace_id, created_at, id);
CREATE TABLE app.schema_metadata (
  singleton boolean PRIMARY KEY DEFAULT true CONSTRAINT schema_metadata_singleton CHECK (singleton),
  version integer NOT NULL CONSTRAINT schema_metadata_positive_version CHECK (version > 0)
);
INSERT INTO app.schema_metadata(singleton, version) VALUES (true, 1);
--> statement-breakpoint
CREATE FUNCTION app.current_actor_id() RETURNS text
LANGUAGE sql STABLE SET search_path = pg_catalog
AS $$ SELECT nullif(current_setting('app.user_id', true), '') $$;
CREATE FUNCTION app.current_workspace_id() RETURNS uuid
LANGUAGE plpgsql STABLE SET search_path = pg_catalog
AS $$
DECLARE requested text := nullif(current_setting('app.workspace_id', true), '');
BEGIN
  IF requested IS NULL OR requested !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN NULL;
  END IF;
  RETURN requested::uuid;
END $$;
-- Narrow privileged lookup avoids recursive membership RLS. It derives actor
-- from the transaction context and never returns another user's membership.
CREATE FUNCTION app.actor_role(target_workspace uuid) RETURNS app.membership_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS $$
  SELECT m.role FROM app.workspace_memberships AS m
  WHERE m.workspace_id = target_workspace AND m.user_id = app.current_actor_id()
$$;
CREATE FUNCTION app.list_own_workspaces()
RETURNS TABLE (id uuid, name text, is_demo boolean, membership_role app.membership_role, timezone text, reporting_currency text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS $$
  SELECT w.id, w.name, w.is_demo, m.role, w.timezone, w.reporting_currency
  FROM app.workspaces AS w JOIN app.workspace_memberships AS m ON m.workspace_id = w.id
  WHERE m.user_id = app.current_actor_id()
  ORDER BY w.is_demo, w.created_at, w.id
$$;
CREATE FUNCTION app.create_personal_workspace(workspace_name text, workspace_uuid uuid, demo boolean DEFAULT false)
RETURNS TABLE (id uuid, name text, is_demo boolean, membership_role app.membership_role, timezone text, reporting_currency text)
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
  RETURN QUERY SELECT w.id, w.name, w.is_demo, 'owner'::app.membership_role, w.timezone, w.reporting_currency
    FROM app.workspaces AS w WHERE w.id = workspace_uuid;
END $$;
--> statement-breakpoint
CREATE FUNCTION app.require_workspace_owner() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE target uuid;
targets uuid[];
BEGIN
  IF TG_OP = 'INSERT' THEN targets := ARRAY[NEW.workspace_id];
  ELSIF TG_OP = 'DELETE' THEN targets := ARRAY[OLD.workspace_id];
  ELSE targets := ARRAY[OLD.workspace_id, NEW.workspace_id];
  END IF;
  FOR target IN SELECT DISTINCT unnest(targets) ORDER BY 1 LOOP
    PERFORM 1 FROM app.workspaces AS w WHERE w.id = target FOR UPDATE;
    IF FOUND AND NOT EXISTS (
      SELECT 1 FROM app.workspace_memberships AS m WHERE m.workspace_id = target AND m.role = 'owner'
    ) THEN
      RAISE EXCEPTION 'A workspace must retain an owner' USING ERRCODE = '23514';
    END IF;
  END LOOP;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER workspace_owner_required
AFTER INSERT OR UPDATE OR DELETE ON app.workspace_memberships
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.require_workspace_owner();
--> statement-breakpoint
ALTER TABLE app.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.workspaces FORCE ROW LEVEL SECURITY;
ALTER TABLE app.workspace_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.workspace_memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE app.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.user_preferences FORCE ROW LEVEL SECURITY;
ALTER TABLE app.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.audit_events FORCE ROW LEVEL SECURITY;
CREATE POLICY workspace_member_read ON app.workspaces FOR SELECT TO journal_app
USING (id = app.current_workspace_id() AND app.actor_role(id) IS NOT NULL);
CREATE POLICY workspace_owner_update ON app.workspaces FOR UPDATE TO journal_app
USING (id = app.current_workspace_id() AND app.actor_role(id) = 'owner')
WITH CHECK (id = app.current_workspace_id() AND app.actor_role(id) = 'owner');
-- Own membership read is the only direct actor-only bootstrap exception.
CREATE POLICY membership_bootstrap_read ON app.workspace_memberships FOR SELECT TO journal_app
USING (
  app.current_actor_id() IS NOT NULL AND (
    (user_id = app.current_actor_id() AND (app.current_workspace_id() IS NULL OR workspace_id = app.current_workspace_id()))
    OR (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) = 'owner')
  )
);
CREATE POLICY own_preference_read ON app.user_preferences FOR SELECT TO journal_app
USING (workspace_id = app.current_workspace_id() AND user_id = app.current_actor_id() AND app.actor_role(workspace_id) IS NOT NULL);
CREATE POLICY own_preference_insert ON app.user_preferences FOR INSERT TO journal_app
WITH CHECK (workspace_id = app.current_workspace_id() AND user_id = app.current_actor_id() AND app.actor_role(workspace_id) IS NOT NULL);
CREATE POLICY own_preference_update ON app.user_preferences FOR UPDATE TO journal_app
USING (workspace_id = app.current_workspace_id() AND user_id = app.current_actor_id() AND app.actor_role(workspace_id) IS NOT NULL)
WITH CHECK (workspace_id = app.current_workspace_id() AND user_id = app.current_actor_id() AND app.actor_role(workspace_id) IS NOT NULL);
CREATE POLICY own_preference_delete ON app.user_preferences FOR DELETE TO journal_app
USING (workspace_id = app.current_workspace_id() AND user_id = app.current_actor_id() AND app.actor_role(workspace_id) IS NOT NULL);
CREATE POLICY audit_member_read ON app.audit_events FOR SELECT TO journal_app
USING (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IS NOT NULL);
CREATE POLICY audit_actor_insert ON app.audit_events FOR INSERT TO journal_app
WITH CHECK (workspace_id = app.current_workspace_id() AND actor_id = app.current_actor_id() AND app.actor_role(workspace_id) IS NOT NULL);
--> statement-breakpoint
ALTER TABLE auth."user" OWNER TO journal_migrator;
ALTER TABLE auth.session OWNER TO journal_migrator;
ALTER TABLE auth.account OWNER TO journal_migrator;
ALTER TABLE auth.verification OWNER TO journal_migrator;
ALTER TABLE auth.rate_limit OWNER TO journal_migrator;
ALTER TABLE app.workspaces OWNER TO journal_migrator;
ALTER TABLE app.workspace_memberships OWNER TO journal_migrator;
ALTER TABLE app.user_preferences OWNER TO journal_migrator;
ALTER TABLE app.audit_events OWNER TO journal_migrator;
ALTER TABLE app.schema_metadata OWNER TO journal_migrator;
ALTER FUNCTION app.current_actor_id() OWNER TO journal_migrator;
ALTER FUNCTION app.current_workspace_id() OWNER TO journal_migrator;
ALTER FUNCTION app.actor_role(uuid) OWNER TO journal_migrator;
ALTER FUNCTION app.list_own_workspaces() OWNER TO journal_migrator;
ALTER FUNCTION app.create_personal_workspace(text, uuid, boolean) OWNER TO journal_migrator;
ALTER FUNCTION app.require_workspace_owner() OWNER TO journal_migrator;
REVOKE ALL ON ALL TABLES IN SCHEMA app, auth FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA auth TO journal_auth;
GRANT SELECT ON app.workspaces, app.workspace_memberships, app.user_preferences, app.audit_events, app.schema_metadata TO journal_app;
GRANT UPDATE (name, timezone, reporting_currency, updated_at) ON app.workspaces TO journal_app;
GRANT INSERT, DELETE ON app.user_preferences TO journal_app;
GRANT UPDATE (theme, timezone, updated_at) ON app.user_preferences TO journal_app;
GRANT INSERT ON app.audit_events TO journal_app;
GRANT EXECUTE ON FUNCTION app.current_actor_id(), app.current_workspace_id(), app.actor_role(uuid), app.list_own_workspaces(), app.create_personal_workspace(text, uuid, boolean) TO journal_app;
