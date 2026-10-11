-- Additive Phase 5 migration. Published migrations 0000-0002 are unchanged.
-- SQL enforces the immutable publication boundary independently of the API.
-- Strategy parameters retain accepted source spelling rather than ledger canonicalization.
CREATE FUNCTION app.strategy_decimal(raw_value text) RETURNS numeric
LANGUAGE plpgsql IMMUTABLE STRICT SET search_path = pg_catalog
AS $$
DECLARE unsigned text := ltrim(raw_value, '-');
BEGIN
  IF char_length(raw_value) > 512
    OR raw_value !~ '^-?(0|[1-9][0-9]*)(\.[0-9]+)?$'
    OR char_length(split_part(unsigned, '.', 1)) > 42
    OR char_length(rtrim(split_part(unsigned, '.', 2), '0')) > 36 THEN
    RAISE EXCEPTION 'Strategy decimal source exceeds exact supported precision' USING ERRCODE = '22003';
  END IF;
  RETURN raw_value::numeric;
END $$;
ALTER FUNCTION app.strategy_decimal(text) OWNER TO journal_migrator;
REVOKE ALL ON FUNCTION app.strategy_decimal(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.strategy_decimal(text) TO journal_app;
--> statement-breakpoint
CREATE FUNCTION app.valid_strategy_definition(definition jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog
AS $$
DECLARE key text; item jsonb; child jsonb; allowed_keys text[]; decimal_value numeric; lower_bound numeric; upper_bound numeric;
  uuid_pattern constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
BEGIN
  IF jsonb_typeof(definition) IS DISTINCT FROM 'object' OR octet_length(definition::text) > 1048576 THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(definition) AS keys(object_key) WHERE keys.object_key <> ALL(ARRAY[
    'name','description','status','assetClasses','markets','timeframes','direction','setupConditions',
    'entryRules','confirmationRules','invalidationRules','stopLossMethodology','takeProfitMethodology',
    'riskRules','positionSizingRules','exitRules','indicators','attachmentIds','notes','tags','checklist',
    'setups','parameters','hypothesis','style','sessions','marketRegimeFilters','scalingRules',
    'managementRules','reviewSchedule','eligibleInstruments'])) THEN RETURN false; END IF;
  IF jsonb_typeof(definition->'name') IS DISTINCT FROM 'string' OR char_length(btrim(definition->>'name')) NOT BETWEEN 1 AND 160
    OR (definition->>'status') IS NULL OR definition->>'status' NOT IN ('draft','active','paused','retired')
    OR (definition->>'direction') IS NULL OR definition->>'direction' NOT IN ('long','short','both')
    OR jsonb_typeof(definition->'style') IS DISTINCT FROM 'string' OR char_length(definition->>'style') > 160 THEN RETURN false; END IF;
  FOREACH key IN ARRAY ARRAY['description','setupConditions','entryRules','confirmationRules','invalidationRules',
    'stopLossMethodology','takeProfitMethodology','riskRules','positionSizingRules','exitRules','notes',
    'hypothesis','marketRegimeFilters','scalingRules','managementRules','reviewSchedule'] LOOP
    IF jsonb_typeof(definition->key) IS DISTINCT FROM 'string' OR char_length(definition->>key) > 20000 THEN RETURN false; END IF;
  END LOOP;
  FOREACH key IN ARRAY ARRAY['assetClasses','markets','timeframes','indicators','tags','sessions','attachmentIds','eligibleInstruments','checklist','setups','parameters'] LOOP
    IF jsonb_typeof(definition->key) IS DISTINCT FROM 'array' OR jsonb_array_length(definition->key) > 100 THEN RETURN false; END IF;
  END LOOP;
  FOREACH key IN ARRAY ARRAY['assetClasses','markets','timeframes','indicators','tags','sessions','attachmentIds','eligibleInstruments'] LOOP
    IF (SELECT count(*) <> count(DISTINCT value) FROM jsonb_array_elements(definition->key)) THEN RETURN false; END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(definition->key) LOOP
      IF jsonb_typeof(item) IS DISTINCT FROM 'string' THEN RETURN false; END IF;
      IF key IN ('attachmentIds','eligibleInstruments') THEN
        IF item #>> '{}' !~ uuid_pattern THEN RETURN false; END IF;
      ELSIF char_length(btrim(item #>> '{}')) NOT BETWEEN 1 AND 160 THEN RETURN false;
      END IF;
    END LOOP;
  END LOOP;
  FOREACH key IN ARRAY ARRAY['checklist','setups','parameters'] LOOP
    IF (SELECT count(*) <> count(DISTINCT value->>'id') FROM jsonb_array_elements(definition->key)) THEN RETURN false; END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(definition->key) LOOP
      IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR COALESCE(item->>'id','') !~ uuid_pattern THEN RETURN false; END IF;
      IF key = 'checklist' THEN allowed_keys := ARRAY['id','label','required'];
      ELSIF key = 'setups' THEN allowed_keys := ARRAY['id','name','description','conditions','checklistItemIds'];
      ELSE
        allowed_keys := CASE item->>'type'
          WHEN 'decimal' THEN ARRAY['id','name','description','type','value','unit','minimum','maximum']
          WHEN 'boolean' THEN ARRAY['id','name','description','type','value']
          WHEN 'text' THEN ARRAY['id','name','description','type','value']
          WHEN 'enum' THEN ARRAY['id','name','description','type','value','options']
          ELSE ARRAY[]::text[] END;
      END IF;
      IF EXISTS (SELECT 1 FROM jsonb_object_keys(item) AS keys(object_key) WHERE keys.object_key <> ALL(allowed_keys)) THEN RETURN false; END IF;
      IF key = 'checklist' THEN
        IF jsonb_typeof(item->'label') IS DISTINCT FROM 'string' OR char_length(btrim(item->>'label')) NOT BETWEEN 1 AND 160
          OR jsonb_typeof(item->'required') IS DISTINCT FROM 'boolean' THEN RETURN false; END IF;
      ELSE
        IF jsonb_typeof(item->'name') IS DISTINCT FROM 'string' OR char_length(btrim(item->>'name')) NOT BETWEEN 1 AND 160
          OR jsonb_typeof(item->'description') IS DISTINCT FROM 'string' OR char_length(item->>'description') > 20000 THEN RETURN false; END IF;
        IF key = 'setups' THEN
          IF jsonb_typeof(item->'conditions') IS DISTINCT FROM 'string' OR char_length(item->>'conditions') > 20000
            OR jsonb_typeof(item->'checklistItemIds') IS DISTINCT FROM 'array' OR jsonb_array_length(item->'checklistItemIds') > 100 THEN RETURN false; END IF;
          IF (SELECT count(*) <> count(DISTINCT value) FROM jsonb_array_elements(item->'checklistItemIds')) THEN RETURN false; END IF;
          FOR child IN SELECT value FROM jsonb_array_elements(item->'checklistItemIds') LOOP
            IF jsonb_typeof(child) IS DISTINCT FROM 'string' OR NOT EXISTS (
              SELECT 1 FROM jsonb_array_elements(definition->'checklist') AS checks(value) WHERE value->>'id' = child #>> '{}'
            ) THEN RETURN false; END IF;
          END LOOP;
        ELSE
          CASE item->>'type'
            WHEN 'decimal' THEN
              IF jsonb_typeof(item->'value') IS DISTINCT FROM 'string' OR jsonb_typeof(item->'minimum') NOT IN ('string','null')
                OR jsonb_typeof(item->'maximum') NOT IN ('string','null') OR jsonb_typeof(item->'unit') NOT IN ('string','null')
                OR NOT item ?& ARRAY['minimum','maximum','unit'] OR (jsonb_typeof(item->'unit') = 'string' AND char_length(btrim(item->>'unit')) NOT BETWEEN 1 AND 160) THEN RETURN false; END IF;
              decimal_value := app.strategy_decimal(item->>'value');
              lower_bound := app.strategy_decimal(item->>'minimum');
              upper_bound := app.strategy_decimal(item->>'maximum');
              IF lower_bound > upper_bound OR decimal_value < lower_bound OR decimal_value > upper_bound THEN RETURN false; END IF;
            WHEN 'boolean' THEN IF jsonb_typeof(item->'value') IS DISTINCT FROM 'boolean' THEN RETURN false; END IF;
            WHEN 'text' THEN IF jsonb_typeof(item->'value') IS DISTINCT FROM 'string' OR char_length(item->>'value') > 2000 THEN RETURN false; END IF;
            WHEN 'enum' THEN
              IF jsonb_typeof(item->'value') IS DISTINCT FROM 'string' OR char_length(btrim(item->>'value')) NOT BETWEEN 1 AND 160
                OR jsonb_typeof(item->'options') IS DISTINCT FROM 'array' OR jsonb_array_length(item->'options') NOT BETWEEN 1 AND 100
                OR NOT (item->'options' @> jsonb_build_array(item->'value')) THEN RETURN false; END IF;
              IF (SELECT count(*) <> count(DISTINCT value) FROM jsonb_array_elements(item->'options')) THEN RETURN false; END IF;
              FOR child IN SELECT value FROM jsonb_array_elements(item->'options') LOOP
                IF jsonb_typeof(child) IS DISTINCT FROM 'string' OR char_length(btrim(child #>> '{}')) NOT BETWEEN 1 AND 160 THEN RETURN false; END IF;
              END LOOP;
            ELSE RETURN false;
          END CASE;
        END IF;
      END IF;
    END LOOP;
  END LOOP;
  RETURN true;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR check_violation THEN RETURN false;
END $$;
ALTER FUNCTION app.valid_strategy_definition(jsonb) OWNER TO journal_migrator;
REVOKE ALL ON FUNCTION app.valid_strategy_definition(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.valid_strategy_definition(jsonb) TO journal_app;
--> statement-breakpoint
CREATE TABLE "app"."strategies" (
	"workspace_id" uuid NOT NULL,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" text DEFAULT app.current_actor_id() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"current_version_id" uuid NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"archived_at" timestamp with time zone,
	"archive_reason" text,
	CONSTRAINT "strategies_pkey" PRIMARY KEY("workspace_id","id"),
	CONSTRAINT "strategies_id_check" CHECK (id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
	CONSTRAINT "strategies_current_version_id_check" CHECK (current_version_id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
	CONSTRAINT "strategies_revision_check" CHECK ("app"."strategies"."revision" > 0),
	CONSTRAINT "strategies_updated_at_check" CHECK ("app"."strategies"."updated_at" >= "app"."strategies"."created_at"),
	CONSTRAINT "strategies_archive_check" CHECK (("app"."strategies"."archived_at" IS NULL AND "app"."strategies"."archive_reason" IS NULL) OR ("app"."strategies"."archived_at" IS NOT NULL AND "app"."strategies"."archive_reason" IS NOT NULL AND char_length(btrim("app"."strategies"."archive_reason")) BETWEEN 1 AND 2000))
);
--> statement-breakpoint
ALTER TABLE "app"."strategies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."strategy_attachments" (
	"workspace_id" uuid NOT NULL,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" text DEFAULT app.current_actor_id() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"command_id" uuid NOT NULL,
	"payload_sha256" text NOT NULL,
	"name" text NOT NULL,
	"media_type" text NOT NULL,
	"size" integer NOT NULL,
	"sha256" text NOT NULL,
	"storage_key" text NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"ready_at" timestamp with time zone,
	"removed_at" timestamp with time zone,
	CONSTRAINT "strategy_attachments_pkey" PRIMARY KEY("workspace_id","id"),
	CONSTRAINT "strategy_attachments_command_key" UNIQUE("workspace_id","command_id"),
	CONSTRAINT "strategy_attachments_id_check" CHECK (id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
	CONSTRAINT "strategy_attachments_command_id_check" CHECK (command_id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
	CONSTRAINT "strategy_attachments_payload_hash_check" CHECK ("app"."strategy_attachments"."payload_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "strategy_attachments_hash_check" CHECK ("app"."strategy_attachments"."sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "strategy_attachments_name_check" CHECK (char_length(btrim("app"."strategy_attachments"."name")) BETWEEN 1 AND 255),
	CONSTRAINT "strategy_attachments_media_check" CHECK ("app"."strategy_attachments"."media_type" IN ('image/png','image/jpeg','image/webp','application/pdf')),
	CONSTRAINT "strategy_attachments_size_check" CHECK ("app"."strategy_attachments"."size" BETWEEN 1 AND 10485760),
	CONSTRAINT "strategy_attachments_storage_key_check" CHECK ("app"."strategy_attachments"."storage_key" = "app"."strategy_attachments"."id"::text),
	CONSTRAINT "strategy_attachments_state_check" CHECK ("app"."strategy_attachments"."state" IN ('pending','ready','removed')),
	CONSTRAINT "strategy_attachments_timestamps_check" CHECK (("app"."strategy_attachments"."state" = 'pending' AND "app"."strategy_attachments"."ready_at" IS NULL AND "app"."strategy_attachments"."removed_at" IS NULL) OR ("app"."strategy_attachments"."state" = 'ready' AND "app"."strategy_attachments"."ready_at" IS NOT NULL AND "app"."strategy_attachments"."removed_at" IS NULL) OR ("app"."strategy_attachments"."state" = 'removed' AND "app"."strategy_attachments"."removed_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "app"."strategy_attachments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."strategy_commands" (
	"workspace_id" uuid NOT NULL,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" text DEFAULT app.current_actor_id() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"kind" text NOT NULL,
	"result" jsonb NOT NULL,
	"audit_event_id" uuid NOT NULL,
	CONSTRAINT "strategy_commands_pkey" PRIMARY KEY("workspace_id","id"),
	CONSTRAINT "strategy_commands_idempotency_key" UNIQUE("workspace_id","idempotency_key"),
	CONSTRAINT "strategy_commands_audit_key" UNIQUE("workspace_id","audit_event_id"),
	CONSTRAINT "strategy_commands_id_check" CHECK (id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
	CONSTRAINT "strategy_commands_key_check" CHECK (idempotency_key::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
	CONSTRAINT "strategy_commands_hash_check" CHECK ("app"."strategy_commands"."request_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "strategy_commands_kind_check" CHECK (char_length("app"."strategy_commands"."kind") BETWEEN 1 AND 120),
	CONSTRAINT "strategy_commands_result_check" CHECK (jsonb_typeof("app"."strategy_commands"."result") = 'object')
);
--> statement-breakpoint
ALTER TABLE "app"."strategy_commands" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."strategy_version_attachments" (
	"workspace_id" uuid NOT NULL,
	"strategy_version_id" uuid NOT NULL,
	"attachment_id" uuid NOT NULL,
	"actor_id" text DEFAULT app.current_actor_id() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "strategy_version_attachments_pkey" PRIMARY KEY("workspace_id","strategy_version_id","attachment_id")
);
--> statement-breakpoint
ALTER TABLE "app"."strategy_version_attachments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."strategy_versions" (
	"workspace_id" uuid NOT NULL,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" text DEFAULT app.current_actor_id() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"strategy_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"effective_at" timestamp with time zone NOT NULL,
	"definition" jsonb NOT NULL,
	"definition_hash" text NOT NULL,
	"change_reason" text NOT NULL,
	CONSTRAINT "strategy_versions_pkey" PRIMARY KEY("workspace_id","id"),
	CONSTRAINT "strategy_versions_strategy_version_key" UNIQUE("workspace_id","strategy_id","version"),
	CONSTRAINT "strategy_versions_strategy_identity_key" UNIQUE("workspace_id","strategy_id","id"),
	CONSTRAINT "strategy_versions_id_check" CHECK (id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
	CONSTRAINT "strategy_versions_version_check" CHECK ("app"."strategy_versions"."version" > 0),
	CONSTRAINT "strategy_versions_hash_check" CHECK ("app"."strategy_versions"."definition_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "strategy_versions_reason_check" CHECK (char_length(btrim("app"."strategy_versions"."change_reason")) BETWEEN 1 AND 2000),
	CONSTRAINT "strategy_versions_definition_check" CHECK (app.valid_strategy_definition("app"."strategy_versions"."definition"))
);
--> statement-breakpoint
ALTER TABLE "app"."strategy_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."trade_strategy_links" (
	"workspace_id" uuid NOT NULL,
	"trade_id" uuid NOT NULL,
	"strategy_id" uuid NOT NULL,
	"strategy_version_id" uuid NOT NULL,
	"timing" text NOT NULL,
	"reason" text NOT NULL,
	"actor_id" text DEFAULT app.current_actor_id() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trade_strategy_links_pkey" PRIMARY KEY("workspace_id","trade_id"),
	CONSTRAINT "trade_strategy_links_timing_check" CHECK ("app"."trade_strategy_links"."timing" IN ('recorded-with-trade','retrospective')),
	CONSTRAINT "trade_strategy_links_reason_check" CHECK (char_length(btrim("app"."trade_strategy_links"."reason")) BETWEEN 1 AND 2000)
);
--> statement-breakpoint
ALTER TABLE "app"."trade_strategy_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."strategies" ADD CONSTRAINT "strategies_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."strategies" ADD CONSTRAINT "strategies_current_version_fkey" FOREIGN KEY ("workspace_id","id","current_version_id") REFERENCES "app"."strategy_versions"("workspace_id","strategy_id","id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "app"."strategy_attachments" ADD CONSTRAINT "strategy_attachments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."strategy_commands" ADD CONSTRAINT "strategy_commands_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."strategy_commands" ADD CONSTRAINT "strategy_commands_audit_fkey" FOREIGN KEY ("workspace_id","audit_event_id") REFERENCES "app"."audit_events"("workspace_id","id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "app"."strategy_version_attachments" ADD CONSTRAINT "strategy_version_attachments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."strategy_version_attachments" ADD CONSTRAINT "strategy_version_attachments_version_fkey" FOREIGN KEY ("workspace_id","strategy_version_id") REFERENCES "app"."strategy_versions"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."strategy_version_attachments" ADD CONSTRAINT "strategy_version_attachments_attachment_fkey" FOREIGN KEY ("workspace_id","attachment_id") REFERENCES "app"."strategy_attachments"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."strategy_versions" ADD CONSTRAINT "strategy_versions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."strategy_versions" ADD CONSTRAINT "strategy_versions_strategy_fkey" FOREIGN KEY ("workspace_id","strategy_id") REFERENCES "app"."strategies"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."trade_strategy_links" ADD CONSTRAINT "trade_strategy_links_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."trade_strategy_links" ADD CONSTRAINT "trade_strategy_links_trade_fkey" FOREIGN KEY ("workspace_id","trade_id") REFERENCES "app"."trades"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."trade_strategy_links" ADD CONSTRAINT "trade_strategy_links_version_fkey" FOREIGN KEY ("workspace_id","strategy_id","strategy_version_id") REFERENCES "app"."strategy_versions"("workspace_id","strategy_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "strategies_workspace_archive_id_idx" ON "app"."strategies" USING btree ("workspace_id","archived_at","id");--> statement-breakpoint
CREATE INDEX "strategy_version_attachments_attachment_idx" ON "app"."strategy_version_attachments" USING btree ("workspace_id","attachment_id");--> statement-breakpoint
CREATE INDEX "trade_strategy_links_version_idx" ON "app"."trade_strategy_links" USING btree ("workspace_id","strategy_id","strategy_version_id");
--> statement-breakpoint
ALTER TABLE app.strategies OWNER TO journal_migrator;
ALTER TABLE app.strategies FORCE ROW LEVEL SECURITY;
REVOKE ALL ON app.strategies FROM PUBLIC;
CREATE POLICY strategies_read ON app.strategies FOR SELECT TO journal_app
USING (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IS NOT NULL);
CREATE POLICY strategies_insert ON app.strategies FOR INSERT TO journal_app
WITH CHECK (workspace_id = app.current_workspace_id() AND actor_id = app.current_actor_id() AND app.actor_role(workspace_id) IN ('owner','editor'));
GRANT SELECT, INSERT ON app.strategies TO journal_app;

--> statement-breakpoint
ALTER TABLE app.strategy_versions OWNER TO journal_migrator;
ALTER TABLE app.strategy_versions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON app.strategy_versions FROM PUBLIC;
CREATE POLICY strategy_versions_read ON app.strategy_versions FOR SELECT TO journal_app
USING (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IS NOT NULL);
CREATE POLICY strategy_versions_insert ON app.strategy_versions FOR INSERT TO journal_app
WITH CHECK (workspace_id = app.current_workspace_id() AND actor_id = app.current_actor_id() AND app.actor_role(workspace_id) IN ('owner','editor'));
GRANT SELECT, INSERT ON app.strategy_versions TO journal_app;

--> statement-breakpoint
ALTER TABLE app.strategy_commands OWNER TO journal_migrator;
ALTER TABLE app.strategy_commands FORCE ROW LEVEL SECURITY;
REVOKE ALL ON app.strategy_commands FROM PUBLIC;
CREATE POLICY strategy_commands_read ON app.strategy_commands FOR SELECT TO journal_app
USING (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IS NOT NULL);
CREATE POLICY strategy_commands_insert ON app.strategy_commands FOR INSERT TO journal_app
WITH CHECK (workspace_id = app.current_workspace_id() AND actor_id = app.current_actor_id() AND app.actor_role(workspace_id) IN ('owner','editor'));
GRANT SELECT, INSERT ON app.strategy_commands TO journal_app;

--> statement-breakpoint
ALTER TABLE app.trade_strategy_links OWNER TO journal_migrator;
ALTER TABLE app.trade_strategy_links FORCE ROW LEVEL SECURITY;
REVOKE ALL ON app.trade_strategy_links FROM PUBLIC;
CREATE POLICY trade_strategy_links_read ON app.trade_strategy_links FOR SELECT TO journal_app
USING (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IS NOT NULL);
CREATE POLICY trade_strategy_links_insert ON app.trade_strategy_links FOR INSERT TO journal_app
WITH CHECK (workspace_id = app.current_workspace_id() AND actor_id = app.current_actor_id() AND app.actor_role(workspace_id) IN ('owner','editor'));
GRANT SELECT, INSERT ON app.trade_strategy_links TO journal_app;

--> statement-breakpoint
ALTER TABLE app.strategy_attachments OWNER TO journal_migrator;
ALTER TABLE app.strategy_attachments FORCE ROW LEVEL SECURITY;
REVOKE ALL ON app.strategy_attachments FROM PUBLIC;
CREATE POLICY strategy_attachments_read ON app.strategy_attachments FOR SELECT TO journal_app
USING (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IS NOT NULL);
CREATE POLICY strategy_attachments_insert ON app.strategy_attachments FOR INSERT TO journal_app
WITH CHECK (workspace_id = app.current_workspace_id() AND actor_id = app.current_actor_id() AND app.actor_role(workspace_id) IN ('owner','editor'));
GRANT SELECT, INSERT ON app.strategy_attachments TO journal_app;

--> statement-breakpoint
ALTER TABLE app.strategy_version_attachments OWNER TO journal_migrator;
ALTER TABLE app.strategy_version_attachments FORCE ROW LEVEL SECURITY;
REVOKE ALL ON app.strategy_version_attachments FROM PUBLIC;
CREATE POLICY strategy_version_attachments_read ON app.strategy_version_attachments FOR SELECT TO journal_app
USING (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IS NOT NULL);
CREATE POLICY strategy_version_attachments_insert ON app.strategy_version_attachments FOR INSERT TO journal_app
WITH CHECK (workspace_id = app.current_workspace_id() AND actor_id = app.current_actor_id() AND app.actor_role(workspace_id) IN ('owner','editor'));
GRANT SELECT, INSERT ON app.strategy_version_attachments TO journal_app;

CREATE POLICY strategies_update ON app.strategies FOR UPDATE TO journal_app
USING (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IN ('owner','editor'))
WITH CHECK (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IN ('owner','editor'));
GRANT UPDATE (current_version_id,revision,updated_at,archived_at,archive_reason) ON app.strategies TO journal_app;

CREATE POLICY strategy_attachments_update ON app.strategy_attachments FOR UPDATE TO journal_app
USING (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IN ('owner','editor'))
WITH CHECK (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IN ('owner','editor'));
GRANT UPDATE (state,ready_at,removed_at) ON app.strategy_attachments TO journal_app;

--> statement-breakpoint
CREATE FUNCTION app.reject_strategy_history_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog
AS $$ BEGIN RAISE EXCEPTION 'Published strategy history is immutable' USING ERRCODE = '55000'; END $$;
CREATE FUNCTION app.guard_strategy_identity() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.revision <> 1 OR NEW.archived_at IS NOT NULL THEN
      RAISE EXCEPTION 'New strategy identity must begin at an unarchived revision one' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id OR NEW.id IS DISTINCT FROM OLD.id
      OR NEW.actor_id IS DISTINCT FROM OLD.actor_id OR NEW.created_at IS DISTINCT FROM OLD.created_at
      OR OLD.archived_at IS NOT NULL OR NEW.revision <> OLD.revision + 1
      OR NEW.updated_at < OLD.updated_at
      OR (NEW.current_version_id IS NOT DISTINCT FROM OLD.current_version_id AND NEW.archived_at IS NOT DISTINCT FROM OLD.archived_at)
      OR (NEW.archived_at IS NOT NULL AND NEW.current_version_id IS DISTINCT FROM OLD.current_version_id) THEN
      RAISE EXCEPTION 'Strategy publication or archive must advance the identity revision without rewriting history' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE FUNCTION app.guard_strategy_version() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog
AS $$
DECLARE identity_row app.strategies%ROWTYPE; last_version integer;
BEGIN
  SELECT * INTO identity_row FROM app.strategies
    WHERE workspace_id = NEW.workspace_id AND id = NEW.strategy_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Strategy identity is not accessible' USING ERRCODE = '23503'; END IF;
  IF identity_row.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Archived strategies cannot publish versions' USING ERRCODE = '23514'; END IF;
  SELECT COALESCE(max(version), 0) INTO last_version FROM app.strategy_versions
    WHERE workspace_id = NEW.workspace_id AND strategy_id = NEW.strategy_id;
  IF NEW.version <> last_version + 1 THEN
    RAISE EXCEPTION 'Strategy version sequence must be contiguous' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE FUNCTION app.check_strategy_publication() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog
AS $$
DECLARE target_strategy uuid; target_workspace uuid; identity_row app.strategies%ROWTYPE; latest_version uuid; latest_number integer;
BEGIN
  target_workspace := NEW.workspace_id;
  IF TG_TABLE_NAME = 'strategy_versions' THEN target_strategy := NEW.strategy_id; ELSE target_strategy := NEW.id; END IF;
  SELECT * INTO identity_row FROM app.strategies WHERE workspace_id = target_workspace AND id = target_strategy;
  IF NOT FOUND THEN RAISE EXCEPTION 'Strategy publication identity is missing' USING ERRCODE = '23503'; END IF;
  SELECT id, version INTO latest_version, latest_number FROM app.strategy_versions
    WHERE workspace_id = target_workspace AND strategy_id = target_strategy ORDER BY version DESC LIMIT 1;
  IF latest_version IS NULL OR latest_version IS DISTINCT FROM identity_row.current_version_id
    OR identity_row.revision <> latest_number + (CASE WHEN identity_row.archived_at IS NULL THEN 0 ELSE 1 END) THEN
    RAISE EXCEPTION 'Current strategy version must point to the newest complete publication' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;
CREATE FUNCTION app.guard_strategy_attachment() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.state <> 'pending' THEN RAISE EXCEPTION 'Attachments must be reserved before becoming ready' USING ERRCODE = '23514'; END IF;
  ELSE
    IF (to_jsonb(NEW) - ARRAY['state','ready_at','removed_at']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['state','ready_at','removed_at'])
      OR OLD.state = 'removed' OR NEW.state = OLD.state
      OR NEW.state NOT IN ('ready','removed') OR (OLD.state = 'ready' AND NEW.state <> 'removed')
      OR (OLD.state = 'ready' AND NEW.ready_at IS DISTINCT FROM OLD.ready_at)
      OR (OLD.state = 'pending' AND NEW.state = 'removed' AND NEW.ready_at IS NOT NULL) THEN
      RAISE EXCEPTION 'Attachment metadata and accepted payload are immutable' USING ERRCODE = '23514';
    END IF;
    IF NEW.state = 'removed' AND EXISTS (
      SELECT 1 FROM app.strategy_version_attachments WHERE workspace_id = OLD.workspace_id AND attachment_id = OLD.id
    ) THEN RAISE EXCEPTION 'Historical strategy attachments cannot be removed' USING ERRCODE = '23514'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE FUNCTION app.guard_strategy_attachment_reference() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog
AS $$
DECLARE attachment_state text; definition_ids jsonb;
BEGIN
  SELECT state INTO attachment_state FROM app.strategy_attachments
    WHERE workspace_id = NEW.workspace_id AND id = NEW.attachment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Attachment is not accessible' USING ERRCODE = '23503'; END IF;
  IF attachment_state <> 'ready' THEN RAISE EXCEPTION 'Only ready attachments can be published' USING ERRCODE = '23514'; END IF;
  SELECT definition->'attachmentIds' INTO definition_ids FROM app.strategy_versions
    WHERE workspace_id = NEW.workspace_id AND id = NEW.strategy_version_id;
  IF NOT FOUND OR NOT (definition_ids @> jsonb_build_array(NEW.attachment_id::text)) THEN
    RAISE EXCEPTION 'Attachment reference must be declared in its immutable strategy snapshot' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE FUNCTION app.check_strategy_attachment_references() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog
AS $$
DECLARE expected jsonb; actual jsonb;
BEGIN
  expected := NEW.definition->'attachmentIds';
  SELECT COALESCE(jsonb_agg(attachment_id::text), '[]'::jsonb) INTO actual FROM app.strategy_version_attachments
    WHERE workspace_id = NEW.workspace_id AND strategy_version_id = NEW.id;
  IF expected IS NULL OR NOT (expected @> actual AND actual @> expected) THEN
    RAISE EXCEPTION 'All strategy snapshot attachments must have matching immutable references' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;
CREATE FUNCTION app.guard_trade_strategy_link() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog
AS $$
DECLARE archived timestamptz; trade_archived timestamptz; trade_created timestamptz; trade_transaction numeric;
BEGIN
  SELECT archived_at INTO archived FROM app.strategies
    WHERE workspace_id = NEW.workspace_id AND id = NEW.strategy_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Strategy identity is not accessible' USING ERRCODE = '23503'; END IF;
  IF archived IS NOT NULL THEN RAISE EXCEPTION 'Archived strategies cannot be assigned to trades' USING ERRCODE = '23514'; END IF;
  -- Match the retrospective service lock order: strategy identity, then trade.
  SELECT created_at, archived_at, xmin::text::numeric INTO trade_created, trade_archived, trade_transaction FROM app.trades
    WHERE workspace_id = NEW.workspace_id AND id = NEW.trade_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Trade is not accessible' USING ERRCODE = '23503'; END IF;
  IF trade_archived IS NOT NULL THEN RAISE EXCEPTION 'Archived trades cannot receive strategy links' USING ERRCODE = '23514'; END IF;
  IF NEW.timing = 'recorded-with-trade' AND (trade_created IS DISTINCT FROM transaction_timestamp()
    OR NEW.created_at IS DISTINCT FROM transaction_timestamp()
    OR trade_transaction <> mod(pg_current_xact_id()::text::numeric, 4294967296)) THEN
    RAISE EXCEPTION 'Later strategy assignment must be marked retrospective' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER strategies_identity_guard BEFORE INSERT OR UPDATE ON app.strategies FOR EACH ROW EXECUTE FUNCTION app.guard_strategy_identity();
CREATE TRIGGER strategy_versions_sequence_guard BEFORE INSERT ON app.strategy_versions FOR EACH ROW EXECUTE FUNCTION app.guard_strategy_version();
CREATE CONSTRAINT TRIGGER strategies_publication_guard AFTER INSERT OR UPDATE ON app.strategies DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.check_strategy_publication();
CREATE CONSTRAINT TRIGGER strategy_versions_publication_guard AFTER INSERT ON app.strategy_versions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.check_strategy_publication();
CREATE TRIGGER strategy_attachments_lifecycle_guard BEFORE INSERT OR UPDATE ON app.strategy_attachments FOR EACH ROW EXECUTE FUNCTION app.guard_strategy_attachment();
CREATE TRIGGER strategy_version_attachments_reference_guard BEFORE INSERT ON app.strategy_version_attachments FOR EACH ROW EXECUTE FUNCTION app.guard_strategy_attachment_reference();
CREATE CONSTRAINT TRIGGER strategy_versions_attachments_guard AFTER INSERT ON app.strategy_versions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.check_strategy_attachment_references();
CREATE TRIGGER trade_strategy_links_assignment_guard BEFORE INSERT ON app.trade_strategy_links FOR EACH ROW EXECUTE FUNCTION app.guard_trade_strategy_link();
CREATE TRIGGER strategy_versions_immutable BEFORE UPDATE OR DELETE ON app.strategy_versions FOR EACH ROW EXECUTE FUNCTION app.reject_strategy_history_mutation();
CREATE TRIGGER strategy_commands_immutable BEFORE UPDATE OR DELETE ON app.strategy_commands FOR EACH ROW EXECUTE FUNCTION app.reject_strategy_history_mutation();
CREATE TRIGGER trade_strategy_links_immutable BEFORE UPDATE OR DELETE ON app.trade_strategy_links FOR EACH ROW EXECUTE FUNCTION app.reject_strategy_history_mutation();
CREATE TRIGGER strategy_version_attachments_immutable BEFORE UPDATE OR DELETE ON app.strategy_version_attachments FOR EACH ROW EXECUTE FUNCTION app.reject_strategy_history_mutation();
CREATE TRIGGER strategies_no_delete BEFORE DELETE ON app.strategies FOR EACH ROW EXECUTE FUNCTION app.reject_strategy_history_mutation();
CREATE TRIGGER strategy_attachments_no_delete BEFORE DELETE ON app.strategy_attachments FOR EACH ROW EXECUTE FUNCTION app.reject_strategy_history_mutation();
ALTER FUNCTION app.reject_strategy_history_mutation() OWNER TO journal_migrator;
REVOKE ALL ON FUNCTION app.reject_strategy_history_mutation() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.reject_strategy_history_mutation() TO journal_app;
ALTER FUNCTION app.guard_strategy_identity() OWNER TO journal_migrator;
REVOKE ALL ON FUNCTION app.guard_strategy_identity() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.guard_strategy_identity() TO journal_app;
ALTER FUNCTION app.guard_strategy_version() OWNER TO journal_migrator;
REVOKE ALL ON FUNCTION app.guard_strategy_version() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.guard_strategy_version() TO journal_app;
ALTER FUNCTION app.check_strategy_publication() OWNER TO journal_migrator;
REVOKE ALL ON FUNCTION app.check_strategy_publication() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.check_strategy_publication() TO journal_app;
ALTER FUNCTION app.guard_strategy_attachment() OWNER TO journal_migrator;
REVOKE ALL ON FUNCTION app.guard_strategy_attachment() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.guard_strategy_attachment() TO journal_app;
ALTER FUNCTION app.guard_strategy_attachment_reference() OWNER TO journal_migrator;
REVOKE ALL ON FUNCTION app.guard_strategy_attachment_reference() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.guard_strategy_attachment_reference() TO journal_app;
ALTER FUNCTION app.check_strategy_attachment_references() OWNER TO journal_migrator;
REVOKE ALL ON FUNCTION app.check_strategy_attachment_references() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.check_strategy_attachment_references() TO journal_app;
ALTER FUNCTION app.guard_trade_strategy_link() OWNER TO journal_migrator;
REVOKE ALL ON FUNCTION app.guard_trade_strategy_link() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.guard_trade_strategy_link() TO journal_app;

UPDATE app.schema_metadata SET version = 4 WHERE singleton = true;
