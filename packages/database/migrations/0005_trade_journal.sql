-- Additive Phase 6 journal migration. Published migrations 0000-0004 remain unchanged.
-- Journal snapshots retain source Decimal spelling and cannot change ledger facts.
CREATE FUNCTION app.journal_text_length(value text) RETURNS integer
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE SET search_path = pg_catalog
AS $$ SELECT char_length(value) $$;
CREATE FUNCTION app.journal_uuid(value jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog
AS $$ SELECT jsonb_typeof(value) = 'string' AND value #>> '{}' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' $$;
CREATE FUNCTION app.journal_decimal(value jsonb, allow_zero boolean DEFAULT false) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog
AS $$ BEGIN
  IF jsonb_typeof(value) IS DISTINCT FROM 'string' THEN RETURN false; END IF;
  RETURN CASE WHEN allow_zero THEN app.strategy_decimal(value #>> '{}') >= 0 ELSE app.strategy_decimal(value #>> '{}') > 0 END;
EXCEPTION WHEN numeric_value_out_of_range OR invalid_text_representation THEN RETURN false;
END $$;
--> statement-breakpoint
CREATE FUNCTION app.valid_journal_plan(definition jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog
AS $$
DECLARE key text; item jsonb; child jsonb; risk jsonb;
  keys constant text[] := ARRAY['strategyVersionId','setupId','thesis','marketConditions','timeframe','legs','initialRisk','attachmentIds'];
BEGIN
  IF jsonb_typeof(definition) IS DISTINCT FROM 'object' OR NOT definition ?& keys
    OR EXISTS (SELECT 1 FROM jsonb_object_keys(definition) k WHERE k <> ALL(keys))
    OR app.strategy_json_bytes(definition) > 131072 THEN RETURN false; END IF;
  FOREACH key IN ARRAY ARRAY['strategyVersionId','setupId'] LOOP
    IF jsonb_typeof(definition->key) IS DISTINCT FROM 'null' AND NOT COALESCE(app.journal_uuid(definition->key),false) THEN RETURN false; END IF;
  END LOOP;
  IF jsonb_typeof(definition->'setupId') <> 'null' AND jsonb_typeof(definition->'strategyVersionId') = 'null' THEN RETURN false; END IF;
  FOREACH key IN ARRAY ARRAY['thesis','marketConditions','timeframe'] LOOP
    IF jsonb_typeof(definition->key) IS DISTINCT FROM 'string'
      OR app.journal_text_length(definition->>key) > (CASE WHEN key='timeframe' THEN 160 ELSE 20000 END) THEN RETURN false; END IF;
  END LOOP;
  IF jsonb_typeof(definition->'legs') IS DISTINCT FROM 'array' OR jsonb_array_length(definition->'legs') > 20
    OR jsonb_typeof(definition->'attachmentIds') IS DISTINCT FROM 'array' OR jsonb_array_length(definition->'attachmentIds') > 100 THEN RETURN false; END IF;
  IF (SELECT count(*) <> count(DISTINCT value->>'legId') FROM jsonb_array_elements(definition->'legs'))
    OR (SELECT count(*) <> count(DISTINCT value) FROM jsonb_array_elements(definition->'attachmentIds')) THEN RETURN false; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(definition->'attachmentIds') LOOP
    IF NOT COALESCE(app.journal_uuid(item),false) THEN RETURN false; END IF;
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(definition->'legs') LOOP
    IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR NOT item ?& ARRAY['legId','plannedEntry','plannedStop','plannedTargets','plannedQuantity','estimatedCosts']
      OR EXISTS (SELECT 1 FROM jsonb_object_keys(item) k WHERE k <> ALL(ARRAY['legId','plannedEntry','plannedStop','plannedTargets','plannedQuantity','estimatedCosts']))
      OR NOT COALESCE(app.journal_uuid(item->'legId'),false) THEN RETURN false; END IF;
    FOREACH key IN ARRAY ARRAY['plannedEntry','plannedStop','plannedQuantity','estimatedCosts'] LOOP
      IF jsonb_typeof(item->key) IS DISTINCT FROM 'null' AND NOT app.journal_decimal(item->key,key='estimatedCosts') THEN RETURN false; END IF;
    END LOOP;
    IF jsonb_typeof(item->'plannedTargets') IS DISTINCT FROM 'array' OR jsonb_array_length(item->'plannedTargets') > 100 THEN RETURN false; END IF;
    FOR child IN SELECT value FROM jsonb_array_elements(item->'plannedTargets') LOOP
      IF NOT app.journal_decimal(child) THEN RETURN false; END IF;
    END LOOP;
  END LOOP;
  risk := definition->'initialRisk';
  IF jsonb_typeof(risk) <> 'null' THEN
    IF jsonb_typeof(risk) IS DISTINCT FROM 'object' OR NOT risk ?& ARRAY['amount','currencyId','method','methodNotes']
      OR EXISTS (SELECT 1 FROM jsonb_object_keys(risk) k WHERE k <> ALL(ARRAY['amount','currencyId','method','methodNotes']))
      OR NOT app.journal_decimal(risk->'amount') OR NOT COALESCE(app.journal_uuid(risk->'currencyId'),false)
      OR jsonb_typeof(risk->'method') IS DISTINCT FROM 'string' OR risk->>'method' ~ '^[[:space:]]*$'
      OR app.journal_text_length(risk->>'method') > 160 OR jsonb_typeof(risk->'methodNotes') IS DISTINCT FROM 'string'
      OR app.journal_text_length(risk->>'methodNotes') > 20000 THEN RETURN false; END IF;
  END IF;
  RETURN true;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR check_violation THEN RETURN false;
END $$;
--> statement-breakpoint
CREATE FUNCTION app.valid_journal_document(document jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog
AS $$
DECLARE review jsonb; key text; item jsonb;
  keys constant text[] := ARRAY['marketConditions','mistakes','emotions','confidence','executionQuality','lessonsLearned','postTradeReview','customNotes','exitReason','customTags','actualObservations','ruleAssessments','attachments'];
BEGIN
  IF jsonb_typeof(document) IS DISTINCT FROM 'object' OR NOT document ?& ARRAY['plan','review']
    OR EXISTS (SELECT 1 FROM jsonb_object_keys(document) k WHERE k NOT IN ('plan','review'))
    OR NOT app.valid_journal_plan(document->'plan') OR app.strategy_json_bytes(document) > 131072 THEN RETURN false; END IF;
  review := document->'review';
  IF jsonb_typeof(review) IS DISTINCT FROM 'object' OR NOT review ?& keys
    OR EXISTS (SELECT 1 FROM jsonb_object_keys(review) k WHERE k <> ALL(keys)) THEN RETURN false; END IF;
  FOREACH key IN ARRAY ARRAY['marketConditions','lessonsLearned','postTradeReview','customNotes','exitReason'] LOOP
    IF jsonb_typeof(review->key) IS DISTINCT FROM 'string' OR app.journal_text_length(review->>key) > 20000 THEN RETURN false; END IF;
  END LOOP;
  IF jsonb_typeof(review->'confidence') <> 'null' AND (jsonb_typeof(review->'confidence') IS DISTINCT FROM 'number'
    OR review->>'confidence' !~ '^[1-5]$') THEN RETURN false; END IF;
  IF jsonb_typeof(review->'executionQuality') <> 'null' AND (jsonb_typeof(review->'executionQuality') IS DISTINCT FROM 'string'
    OR review->>'executionQuality' NOT IN ('excellent','good','mixed','poor')) THEN RETURN false; END IF;
  FOREACH key IN ARRAY ARRAY['mistakes','emotions','customTags','actualObservations','ruleAssessments','attachments'] LOOP
    IF jsonb_typeof(review->key) IS DISTINCT FROM 'array' OR jsonb_array_length(review->key) > (CASE WHEN key='actualObservations' THEN 20 ELSE 100 END) THEN RETURN false; END IF;
  END LOOP;
  FOREACH key IN ARRAY ARRAY['mistakes','emotions','customTags'] LOOP
    IF (SELECT count(*) <> count(DISTINCT value) FROM jsonb_array_elements(review->key)) THEN RETURN false; END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(review->key) LOOP
      IF jsonb_typeof(item) IS DISTINCT FROM 'string' OR item #>> '{}' ~ '^[[:space:]]*$'
        OR app.journal_text_length(item #>> '{}') > 160 THEN RETURN false; END IF;
    END LOOP;
  END LOOP;
  IF (SELECT count(*) <> count(DISTINCT value->>'legId') FROM jsonb_array_elements(review->'actualObservations'))
    OR (SELECT count(*) <> count(DISTINCT value->>'checklistItemId') FROM jsonb_array_elements(review->'ruleAssessments'))
    OR (SELECT count(*) <> count(DISTINCT value->>'attachmentId') FROM jsonb_array_elements(review->'attachments')) THEN RETURN false; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(review->'actualObservations') LOOP
    IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR NOT item ?& ARRAY['legId','actualStop','reportedEntry','reportedExit','notes']
      OR EXISTS (SELECT 1 FROM jsonb_object_keys(item) k WHERE k <> ALL(ARRAY['legId','actualStop','reportedEntry','reportedExit','notes']))
      OR NOT COALESCE(app.journal_uuid(item->'legId'),false) OR jsonb_typeof(item->'notes') IS DISTINCT FROM 'string'
      OR app.journal_text_length(item->>'notes') > 20000 THEN RETURN false; END IF;
    FOREACH key IN ARRAY ARRAY['actualStop','reportedEntry','reportedExit'] LOOP
      IF jsonb_typeof(item->key) IS DISTINCT FROM 'null' AND NOT app.journal_decimal(item->key) THEN RETURN false; END IF;
    END LOOP;
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(review->'ruleAssessments') LOOP
    IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR NOT item ?& ARRAY['checklistItemId','outcome','evidence','source']
      OR EXISTS (SELECT 1 FROM jsonb_object_keys(item) k WHERE k <> ALL(ARRAY['checklistItemId','outcome','evidence','source']))
      OR NOT COALESCE(app.journal_uuid(item->'checklistItemId'),false) OR item->>'outcome' NOT IN ('passed','failed','unknown')
      OR jsonb_typeof(item->'outcome') IS DISTINCT FROM 'string' OR item->>'source' IS DISTINCT FROM 'manual'
      OR jsonb_typeof(item->'evidence') IS DISTINCT FROM 'string' OR app.journal_text_length(item->>'evidence') > 20000 THEN RETURN false; END IF;
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(review->'attachments') LOOP
    IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR NOT item ?& ARRAY['attachmentId','phase']
      OR EXISTS (SELECT 1 FROM jsonb_object_keys(item) k WHERE k NOT IN ('attachmentId','phase'))
      OR NOT COALESCE(app.journal_uuid(item->'attachmentId'),false) OR jsonb_typeof(item->'phase') IS DISTINCT FROM 'string'
      OR item->>'phase' NOT IN ('before','during','after') THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR check_violation THEN RETURN false;
END $$;
--> statement-breakpoint
CREATE TABLE "app"."journal_commands" (
	"workspace_id" uuid NOT NULL,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" text DEFAULT app.current_actor_id() NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"kind" text NOT NULL,
	"result" jsonb NOT NULL,
	"audit_event_id" uuid NOT NULL,
	CONSTRAINT "journal_commands_pkey" PRIMARY KEY("workspace_id","id"),
	CONSTRAINT "journal_commands_idempotency_key" UNIQUE("workspace_id","idempotency_key"),
	CONSTRAINT "journal_commands_audit_key" UNIQUE("workspace_id","audit_event_id"),
	CONSTRAINT "journal_commands_id_check" CHECK (id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
	CONSTRAINT "journal_commands_key_check" CHECK (idempotency_key::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
	CONSTRAINT "journal_commands_hash_check" CHECK ("app"."journal_commands"."request_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "journal_commands_kind_check" CHECK (char_length(btrim("app"."journal_commands"."kind")) BETWEEN 1 AND 120),
	CONSTRAINT "journal_commands_result_check" CHECK (jsonb_typeof("app"."journal_commands"."result") = 'object')
);
--> statement-breakpoint
ALTER TABLE "app"."journal_commands" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."journal_entries" (
	"workspace_id" uuid NOT NULL,
	"trade_id" uuid NOT NULL,
	"actor_id" text DEFAULT app.current_actor_id() NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	"current_revision_id" uuid,
	"revision" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	"updated_by" text DEFAULT app.current_actor_id() NOT NULL,
	CONSTRAINT "journal_entries_pkey" PRIMARY KEY("workspace_id","trade_id"),
	CONSTRAINT "journal_entries_revision_check" CHECK ("app"."journal_entries"."revision" >= 0),
	CONSTRAINT "journal_entries_pointer_check" CHECK (("app"."journal_entries"."revision" = 0 AND "app"."journal_entries"."current_revision_id" IS NULL) OR ("app"."journal_entries"."revision" > 0 AND "app"."journal_entries"."current_revision_id" IS NOT NULL)),
	CONSTRAINT "journal_entries_updated_at_check" CHECK ("app"."journal_entries"."updated_at" >= "app"."journal_entries"."created_at")
);
--> statement-breakpoint
ALTER TABLE "app"."journal_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."journal_plan_attachments" (
	"workspace_id" uuid NOT NULL,
	"plan_version_id" uuid NOT NULL,
	"attachment_id" uuid NOT NULL,
	"actor_id" text DEFAULT app.current_actor_id() NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "journal_plan_attachments_pkey" PRIMARY KEY("workspace_id","plan_version_id","attachment_id")
);
--> statement-breakpoint
ALTER TABLE "app"."journal_plan_attachments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."journal_plan_commitments" (
	"workspace_id" uuid NOT NULL,
	"trade_id" uuid NOT NULL,
	"actor_id" text DEFAULT app.current_actor_id() NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	"command_id" uuid NOT NULL,
	"original_plan_id" uuid NOT NULL,
	"committed_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	"financial_source_revision" integer NOT NULL,
	"timing" text NOT NULL,
	CONSTRAINT "journal_plan_commitments_pkey" PRIMARY KEY("workspace_id","trade_id"),
	CONSTRAINT "journal_plan_commitments_revision_check" CHECK ("app"."journal_plan_commitments"."financial_source_revision" >= 0),
	CONSTRAINT "journal_plan_commitments_timing_check" CHECK ("app"."journal_plan_commitments"."timing" IN ('pre-trade','retrospective'))
);
--> statement-breakpoint
ALTER TABLE "app"."journal_plan_commitments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."journal_plan_versions" (
	"workspace_id" uuid NOT NULL,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"trade_id" uuid NOT NULL,
	"actor_id" text DEFAULT app.current_actor_id() NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	"command_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"definition" jsonb NOT NULL,
	"definition_hash" text NOT NULL,
	"change_reason" text NOT NULL,
	CONSTRAINT "journal_plan_versions_pkey" PRIMARY KEY("workspace_id","id"),
	CONSTRAINT "journal_plan_versions_trade_version_key" UNIQUE("workspace_id","trade_id","version"),
	CONSTRAINT "journal_plan_versions_trade_identity_key" UNIQUE("workspace_id","trade_id","id"),
	CONSTRAINT "journal_plan_versions_command_key" UNIQUE("workspace_id","command_id"),
	CONSTRAINT "journal_plan_versions_id_check" CHECK (id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
	CONSTRAINT "journal_plan_versions_version_check" CHECK ("app"."journal_plan_versions"."version" > 0),
	CONSTRAINT "journal_plan_versions_hash_check" CHECK ("app"."journal_plan_versions"."definition_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "journal_plan_versions_reason_check" CHECK (app.journal_text_length(btrim("app"."journal_plan_versions"."change_reason")) BETWEEN 1 AND 2000),
	CONSTRAINT "journal_plan_versions_definition_check" CHECK (app.valid_journal_plan("app"."journal_plan_versions"."definition")),
	CONSTRAINT "journal_plan_versions_definition_size_check" CHECK (app.strategy_json_bytes("app"."journal_plan_versions"."definition") <= 131072)
);
--> statement-breakpoint
ALTER TABLE "app"."journal_plan_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."journal_revision_attachments" (
	"workspace_id" uuid NOT NULL,
	"revision_id" uuid NOT NULL,
	"attachment_id" uuid NOT NULL,
	"phase" text NOT NULL,
	"actor_id" text DEFAULT app.current_actor_id() NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "journal_revision_attachments_pkey" PRIMARY KEY("workspace_id","revision_id","attachment_id","phase"),
	CONSTRAINT "journal_revision_attachments_phase_check" CHECK ("app"."journal_revision_attachments"."phase" IN ('planning','before','during','after'))
);
--> statement-breakpoint
ALTER TABLE "app"."journal_revision_attachments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."journal_revisions" (
	"workspace_id" uuid NOT NULL,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"trade_id" uuid NOT NULL,
	"actor_id" text DEFAULT app.current_actor_id() NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	"command_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"document" jsonb NOT NULL,
	"document_hash" text NOT NULL,
	"change_reason" text NOT NULL,
	CONSTRAINT "journal_revisions_pkey" PRIMARY KEY("workspace_id","id"),
	CONSTRAINT "journal_revisions_trade_revision_key" UNIQUE("workspace_id","trade_id","revision"),
	CONSTRAINT "journal_revisions_trade_identity_key" UNIQUE("workspace_id","trade_id","id"),
	CONSTRAINT "journal_revisions_command_key" UNIQUE("workspace_id","command_id"),
	CONSTRAINT "journal_revisions_id_check" CHECK (id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
	CONSTRAINT "journal_revisions_revision_check" CHECK ("app"."journal_revisions"."revision" > 0),
	CONSTRAINT "journal_revisions_hash_check" CHECK ("app"."journal_revisions"."document_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "journal_revisions_reason_check" CHECK (app.journal_text_length(btrim("app"."journal_revisions"."change_reason")) BETWEEN 1 AND 2000),
	CONSTRAINT "journal_revisions_document_check" CHECK (app.valid_journal_document("app"."journal_revisions"."document")),
	CONSTRAINT "journal_revisions_document_size_check" CHECK (app.strategy_json_bytes("app"."journal_revisions"."document") <= 131072)
);
--> statement-breakpoint
ALTER TABLE "app"."journal_revisions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."journal_risk_additions" (
	"workspace_id" uuid NOT NULL,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"trade_id" uuid NOT NULL,
	"actor_id" text DEFAULT app.current_actor_id() NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	"command_id" uuid NOT NULL,
	"amount_raw" text NOT NULL,
	"amount" numeric GENERATED ALWAYS AS (app.strategy_decimal(amount_raw)) STORED,
	"currency_id" uuid NOT NULL,
	"method" text NOT NULL,
	"method_notes" text NOT NULL,
	"reason" text NOT NULL,
	CONSTRAINT "journal_risk_additions_pkey" PRIMARY KEY("workspace_id","id"),
	CONSTRAINT "journal_risk_additions_command_key" UNIQUE("workspace_id","command_id"),
	CONSTRAINT "journal_risk_additions_id_check" CHECK (id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
	CONSTRAINT "journal_risk_additions_amount_check" CHECK ("app"."journal_risk_additions"."amount" > 0),
	CONSTRAINT "journal_risk_additions_method_check" CHECK (app.journal_text_length(btrim("app"."journal_risk_additions"."method")) BETWEEN 1 AND 160),
	CONSTRAINT "journal_risk_additions_notes_check" CHECK (app.journal_text_length("app"."journal_risk_additions"."method_notes") <= 20000),
	CONSTRAINT "journal_risk_additions_reason_check" CHECK (app.journal_text_length(btrim("app"."journal_risk_additions"."reason")) BETWEEN 1 AND 2000)
);
--> statement-breakpoint
ALTER TABLE "app"."journal_risk_additions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."journal_commands" ADD CONSTRAINT "journal_commands_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "app"."journal_commands" ADD CONSTRAINT "journal_commands_audit_fkey" FOREIGN KEY ("workspace_id","audit_event_id") REFERENCES "app"."audit_events"("workspace_id","id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "app"."journal_entries" ADD CONSTRAINT "journal_entries_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "app"."journal_entries" ADD CONSTRAINT "journal_entries_trade_fkey" FOREIGN KEY ("workspace_id","trade_id") REFERENCES "app"."trades"("workspace_id","id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "app"."journal_entries" ADD CONSTRAINT "journal_entries_current_revision_fkey" FOREIGN KEY ("workspace_id","trade_id","current_revision_id") REFERENCES "app"."journal_revisions"("workspace_id","trade_id","id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "app"."journal_plan_attachments" ADD CONSTRAINT "journal_plan_attachments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "app"."journal_plan_attachments" ADD CONSTRAINT "journal_plan_attachments_plan_fkey" FOREIGN KEY ("workspace_id","plan_version_id") REFERENCES "app"."journal_plan_versions"("workspace_id","id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "app"."journal_plan_attachments" ADD CONSTRAINT "journal_plan_attachments_attachment_fkey" FOREIGN KEY ("workspace_id","attachment_id") REFERENCES "app"."strategy_attachments"("workspace_id","id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "app"."journal_plan_commitments" ADD CONSTRAINT "journal_plan_commitments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "app"."journal_plan_commitments" ADD CONSTRAINT "journal_plan_commitments_plan_fkey" FOREIGN KEY ("workspace_id","trade_id","original_plan_id") REFERENCES "app"."journal_plan_versions"("workspace_id","trade_id","id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "app"."journal_plan_commitments" ADD CONSTRAINT "journal_plan_commitments_command_fkey" FOREIGN KEY ("workspace_id","command_id") REFERENCES "app"."journal_commands"("workspace_id","id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "app"."journal_plan_versions" ADD CONSTRAINT "journal_plan_versions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "app"."journal_plan_versions" ADD CONSTRAINT "journal_plan_versions_trade_fkey" FOREIGN KEY ("workspace_id","trade_id") REFERENCES "app"."trades"("workspace_id","id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "app"."journal_plan_versions" ADD CONSTRAINT "journal_plan_versions_command_fkey" FOREIGN KEY ("workspace_id","command_id") REFERENCES "app"."journal_commands"("workspace_id","id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "app"."journal_revision_attachments" ADD CONSTRAINT "journal_revision_attachments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "app"."journal_revision_attachments" ADD CONSTRAINT "journal_revision_attachments_revision_fkey" FOREIGN KEY ("workspace_id","revision_id") REFERENCES "app"."journal_revisions"("workspace_id","id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "app"."journal_revision_attachments" ADD CONSTRAINT "journal_revision_attachments_attachment_fkey" FOREIGN KEY ("workspace_id","attachment_id") REFERENCES "app"."strategy_attachments"("workspace_id","id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "app"."journal_revisions" ADD CONSTRAINT "journal_revisions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "app"."journal_revisions" ADD CONSTRAINT "journal_revisions_entry_fkey" FOREIGN KEY ("workspace_id","trade_id") REFERENCES "app"."journal_entries"("workspace_id","trade_id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "app"."journal_revisions" ADD CONSTRAINT "journal_revisions_command_fkey" FOREIGN KEY ("workspace_id","command_id") REFERENCES "app"."journal_commands"("workspace_id","id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "app"."journal_risk_additions" ADD CONSTRAINT "journal_risk_additions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "app"."journal_risk_additions" ADD CONSTRAINT "journal_risk_additions_commitment_fkey" FOREIGN KEY ("workspace_id","trade_id") REFERENCES "app"."journal_plan_commitments"("workspace_id","trade_id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "app"."journal_risk_additions" ADD CONSTRAINT "journal_risk_additions_currency_fkey" FOREIGN KEY ("workspace_id","currency_id") REFERENCES "app"."currencies"("workspace_id","id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "app"."journal_risk_additions" ADD CONSTRAINT "journal_risk_additions_command_fkey" FOREIGN KEY ("workspace_id","command_id") REFERENCES "app"."journal_commands"("workspace_id","id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
CREATE INDEX "journal_plan_attachments_file_idx" ON "app"."journal_plan_attachments" USING btree ("workspace_id","attachment_id");--> statement-breakpoint
CREATE INDEX "journal_revision_attachments_file_idx" ON "app"."journal_revision_attachments" USING btree ("workspace_id","attachment_id");--> statement-breakpoint
CREATE INDEX "journal_revisions_history_idx" ON "app"."journal_revisions" USING btree ("workspace_id","trade_id","revision");--> statement-breakpoint
CREATE INDEX "journal_risk_additions_trade_idx" ON "app"."journal_risk_additions" USING btree ("workspace_id","trade_id","id");--> statement-breakpoint
-- Tenant ownership remains enforced even for table owners; runtime history is insert-only.
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['journal_commands','journal_entries','journal_plan_attachments','journal_plan_commitments',
    'journal_plan_versions','journal_revision_attachments','journal_revisions','journal_risk_additions'] LOOP
    EXECUTE format('ALTER TABLE app.%I OWNER TO journal_migrator',table_name);
    EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC',table_name);
    EXECUTE format('CREATE POLICY %I ON app.%I FOR SELECT TO journal_app USING (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IS NOT NULL)',table_name || '_read',table_name);
    EXECUTE format('CREATE POLICY %I ON app.%I FOR INSERT TO journal_app WITH CHECK (workspace_id = app.current_workspace_id() AND actor_id = app.current_actor_id() AND app.actor_role(workspace_id) IN (''owner'',''editor''))',table_name || '_insert',table_name);
    EXECUTE format('GRANT SELECT, INSERT ON app.%I TO journal_app',table_name);
  END LOOP;
END $$;
CREATE POLICY journal_entries_update ON app.journal_entries FOR UPDATE TO journal_app
USING (workspace_id=app.current_workspace_id() AND app.actor_role(workspace_id) IN ('owner','editor'))
WITH CHECK (workspace_id=app.current_workspace_id() AND updated_by=app.current_actor_id() AND app.actor_role(workspace_id) IN ('owner','editor'));
GRANT UPDATE(current_revision_id,revision,updated_at,updated_by) ON app.journal_entries TO journal_app;
--> statement-breakpoint
CREATE FUNCTION app.reject_journal_history_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog
AS $$ BEGIN RAISE EXCEPTION 'Journal history and original plan commitments are immutable' USING ERRCODE='55000'; END $$;
CREATE FUNCTION app.guard_journal_entry() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog
AS $$ BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.revision<>0 OR NEW.current_revision_id IS NOT NULL THEN
      RAISE EXCEPTION 'Journal identities begin at revision zero' USING ERRCODE='23514';
    END IF;
  ELSE
    IF (to_jsonb(NEW)-ARRAY['current_revision_id','revision','updated_at','updated_by'])
      IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['current_revision_id','revision','updated_at','updated_by'])
      OR NEW.revision<>OLD.revision+1 OR NEW.current_revision_id IS NOT DISTINCT FROM OLD.current_revision_id
      OR NEW.updated_at<OLD.updated_at OR NEW.updated_by IS DISTINCT FROM app.current_actor_id() THEN
      RAISE EXCEPTION 'Journal identity must advance one revision without rewriting history' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE FUNCTION app.guard_journal_revision() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog
AS $$ DECLARE current_revision integer;
BEGIN
  SELECT revision INTO current_revision FROM app.journal_entries
    WHERE workspace_id=NEW.workspace_id AND trade_id=NEW.trade_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Journal identity is missing' USING ERRCODE='23503'; END IF;
  IF NEW.revision<>current_revision+1 THEN
    RAISE EXCEPTION 'Journal revision sequence must be contiguous' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE FUNCTION app.check_journal_pointer() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog
AS $$ DECLARE target_trade uuid := NEW.trade_id; header app.journal_entries%ROWTYPE; latest app.journal_revisions%ROWTYPE;
BEGIN
  SELECT * INTO header FROM app.journal_entries WHERE workspace_id=NEW.workspace_id AND trade_id=target_trade;
  SELECT * INTO latest FROM app.journal_revisions WHERE workspace_id=NEW.workspace_id AND trade_id=target_trade ORDER BY revision DESC LIMIT 1;
  IF header.trade_id IS NULL OR header.revision IS DISTINCT FROM COALESCE(latest.revision,0)
    OR header.current_revision_id IS DISTINCT FROM latest.id
    OR (latest.id IS NOT NULL AND header.updated_by IS DISTINCT FROM latest.actor_id) THEN
    RAISE EXCEPTION 'Journal pointer must select its newest complete immutable revision' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;
CREATE FUNCTION app.guard_journal_plan_version() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog
AS $$ DECLARE last_version integer; archived timestamptz; lifecycle text;
BEGIN
  SELECT archived_at,status INTO archived,lifecycle FROM app.trades WHERE workspace_id=NEW.workspace_id AND id=NEW.trade_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Trade is not accessible' USING ERRCODE='23503'; END IF;
  IF archived IS NOT NULL OR lifecycle IN ('closed','canceled') THEN RAISE EXCEPTION 'Only active trades can publish new plans' USING ERRCODE='23514'; END IF;
  SELECT COALESCE(max(version),0) INTO last_version FROM app.journal_plan_versions WHERE workspace_id=NEW.workspace_id AND trade_id=NEW.trade_id;
  IF NEW.version<>last_version+1 THEN RAISE EXCEPTION 'Plan version sequence must be contiguous' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE FUNCTION app.guard_journal_risk_addition() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog
AS $$ DECLARE lifecycle text; archived timestamptz;
BEGIN
  SELECT status,archived_at INTO lifecycle,archived FROM app.trades
    WHERE workspace_id=NEW.workspace_id AND id=NEW.trade_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Trade is not accessible' USING ERRCODE='23503'; END IF;
  IF archived IS NOT NULL OR lifecycle IN ('closed','canceled') THEN
    RAISE EXCEPTION 'Only active trades can record risk additions' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE FUNCTION app.guard_journal_commitment() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog
AS $$ DECLARE source_boundary integer; original_version integer; earliest_execution timestamptz;
BEGIN
  SELECT revision INTO source_boundary FROM app.financial_state WHERE workspace_id=NEW.workspace_id FOR UPDATE;
  IF NOT FOUND OR source_boundary IS DISTINCT FROM NEW.financial_source_revision THEN
    RAISE EXCEPTION 'Original commitment must capture the locked financial source revision' USING ERRCODE='23514';
  END IF;
  SELECT version INTO original_version FROM app.journal_plan_versions
    WHERE workspace_id=NEW.workspace_id AND trade_id=NEW.trade_id AND id=NEW.original_plan_id;
  IF original_version IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'Original commitment must reference the first plan' USING ERRCODE='23514'; END IF;
  -- Caller clocks and backdated timestamps cannot manufacture a pre-trade record.
  NEW.committed_at := clock_timestamp();
  SELECT min(e.economic_at) INTO earliest_execution FROM app.executions e
    JOIN LATERAL (SELECT id FROM app.allocation_sets WHERE workspace_id=e.workspace_id AND execution_id=e.id
      AND source_revision<=NEW.financial_source_revision ORDER BY version DESC LIMIT 1) s ON true
    JOIN app.allocation_items i ON i.workspace_id=e.workspace_id AND i.allocation_set_id=s.id
    JOIN app.trade_legs l ON l.workspace_id=i.workspace_id AND l.id=i.trade_leg_id
    WHERE e.workspace_id=NEW.workspace_id AND l.trade_id=NEW.trade_id AND i.quantity>0 AND e.source_revision<=NEW.financial_source_revision
      AND NOT EXISTS (SELECT 1 FROM app.execution_supersessions x WHERE x.workspace_id=e.workspace_id
        AND x.original_execution_id=e.id AND x.source_revision<=NEW.financial_source_revision);
  NEW.timing := CASE WHEN earliest_execution IS NOT NULL AND earliest_execution<=NEW.committed_at THEN 'retrospective' ELSE 'pre-trade' END;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE FUNCTION app.check_journal_references(target_workspace uuid,target_trade uuid,document jsonb,is_plan boolean) RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog
AS $$ DECLARE plan jsonb := CASE WHEN is_plan THEN document ELSE document->'plan' END;
  review jsonb := CASE WHEN is_plan THEN NULL ELSE document->'review' END;
  selected uuid := (plan->>'strategyVersionId')::uuid; pinned uuid; effective uuid; strategy_definition jsonb; item jsonb;
BEGIN
  SELECT strategy_version_id INTO pinned FROM app.trade_strategy_links WHERE workspace_id=target_workspace AND trade_id=target_trade;
  IF selected IS NOT NULL AND pinned IS NOT NULL AND selected IS DISTINCT FROM pinned THEN
    RAISE EXCEPTION 'Journal strategy must match the immutable trade pin' USING ERRCODE='23514';
  END IF;
  IF is_plan AND selected IS DISTINCT FROM pinned THEN
    RAISE EXCEPTION 'Published plan must capture the immutable trade strategy version' USING ERRCODE='23514';
  END IF;
  effective := COALESCE(selected,pinned);
  IF effective IS NOT NULL THEN
    SELECT definition INTO strategy_definition FROM app.strategy_versions WHERE workspace_id=target_workspace AND id=effective;
    IF NOT FOUND THEN RAISE EXCEPTION 'Strategy version is not accessible' USING ERRCODE='23503'; END IF;
  END IF;
  IF plan->>'setupId' IS NOT NULL AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(strategy_definition->'setups') s WHERE s->>'id'=plan->>'setupId') THEN
    RAISE EXCEPTION 'Setup must belong to the selected strategy version' USING ERRCODE='23514';
  END IF;
  IF plan->'initialRisk'->>'currencyId' IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM app.currencies WHERE workspace_id=target_workspace AND id=(plan->'initialRisk'->>'currencyId')::uuid
  ) THEN RAISE EXCEPTION 'Risk currency is not accessible' USING ERRCODE='23503'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(plan->'legs') UNION ALL SELECT value FROM jsonb_array_elements(review->'actualObservations') LOOP
    IF NOT EXISTS (SELECT 1 FROM app.trade_legs WHERE workspace_id=target_workspace AND trade_id=target_trade AND id=(item->>'legId')::uuid) THEN
      RAISE EXCEPTION 'Journal leg must belong to the same trade' USING ERRCODE='23503';
    END IF;
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(review->'ruleAssessments') LOOP
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(strategy_definition->'checklist') c WHERE c->>'id'=item->>'checklistItemId') THEN
      RAISE EXCEPTION 'Rule assessment must identify the pinned strategy checklist item' USING ERRCODE='23514';
    END IF;
  END LOOP;
END $$;
CREATE FUNCTION app.check_journal_fact() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog
AS $$ DECLARE command app.journal_commands%ROWTYPE; command_transaction numeric; revision app.journal_revisions%ROWTYPE; expected_kind text;
BEGIN
  SELECT * INTO command FROM app.journal_commands WHERE workspace_id=NEW.workspace_id AND id=NEW.command_id;
  SELECT xmin::text::numeric INTO command_transaction FROM app.journal_commands WHERE workspace_id=NEW.workspace_id AND id=NEW.command_id;
  IF NOT FOUND OR command.actor_id IS DISTINCT FROM NEW.actor_id
    OR command_transaction<>mod(pg_current_xact_id()::text::numeric,4294967296) THEN
    RAISE EXCEPTION 'Journal history must belong to its new atomic command' USING ERRCODE='23514';
  END IF;
  SELECT * INTO revision FROM app.journal_revisions WHERE workspace_id=NEW.workspace_id AND command_id=NEW.command_id;
  IF revision.trade_id IS DISTINCT FROM NEW.trade_id OR revision.actor_id IS DISTINCT FROM NEW.actor_id THEN
    RAISE EXCEPTION 'Journal command facts must belong to one trade and actor' USING ERRCODE='23514';
  END IF;
  IF TG_TABLE_NAME='journal_revisions' THEN
    PERFORM app.check_journal_references(NEW.workspace_id,NEW.trade_id,NEW.document,false);
  ELSIF TG_TABLE_NAME='journal_plan_versions' THEN
    expected_kind := 'plan-published';
    PERFORM app.check_journal_references(NEW.workspace_id,NEW.trade_id,NEW.definition,true);
    IF revision.document->'plan' IS DISTINCT FROM NEW.definition THEN
      RAISE EXCEPTION 'Published plan must match its journal snapshot' USING ERRCODE='23514';
    END IF;
    IF NEW.version=1 AND NOT EXISTS (SELECT 1 FROM app.journal_plan_commitments WHERE workspace_id=NEW.workspace_id AND trade_id=NEW.trade_id AND original_plan_id=NEW.id AND command_id=NEW.command_id) THEN
      RAISE EXCEPTION 'First plan publication requires its original commitment' USING ERRCODE='23514';
    END IF;
  ELSIF TG_TABLE_NAME='journal_plan_commitments' THEN
    expected_kind := 'plan-published';
    IF NOT EXISTS (SELECT 1 FROM app.journal_plan_versions WHERE workspace_id=NEW.workspace_id AND trade_id=NEW.trade_id
      AND id=NEW.original_plan_id AND version=1 AND command_id=NEW.command_id) THEN
      RAISE EXCEPTION 'Original commitment must be atomic with the first plan publication' USING ERRCODE='23514';
    END IF;
  ELSE expected_kind := 'risk-added';
  END IF;
  IF expected_kind IS NOT NULL AND command.kind IS DISTINCT FROM expected_kind THEN
    RAISE EXCEPTION 'Journal effect does not match the atomic command kind' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;
CREATE FUNCTION app.check_journal_command() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog
AS $$ DECLARE revision_count integer; plan_count integer; risk_count integer;
BEGIN
  SELECT count(*) INTO revision_count FROM app.journal_revisions WHERE workspace_id=NEW.workspace_id AND command_id=NEW.id;
  SELECT count(*) INTO plan_count FROM app.journal_plan_versions WHERE workspace_id=NEW.workspace_id AND command_id=NEW.id;
  SELECT count(*) INTO risk_count FROM app.journal_risk_additions WHERE workspace_id=NEW.workspace_id AND command_id=NEW.id;
  IF revision_count<>1 OR NEW.kind NOT IN ('saved','plan-published','risk-added')
    OR plan_count<>(CASE WHEN NEW.kind='plan-published' THEN 1 ELSE 0 END)
    OR risk_count<>(CASE WHEN NEW.kind='risk-added' THEN 1 ELSE 0 END)
    OR NOT EXISTS (SELECT 1 FROM app.audit_events WHERE workspace_id=NEW.workspace_id AND id=NEW.audit_event_id
      AND actor_id=NEW.actor_id AND action='journal.' || NEW.kind
      AND xmin::text::numeric=mod(pg_current_xact_id()::text::numeric,4294967296)) THEN
    RAISE EXCEPTION 'Journal command requires one complete mutation and its atomic audit' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE FUNCTION app.guard_journal_attachment_reference() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog
AS $$ DECLARE snapshot jsonb; current_fact boolean; attachment_state text; declared boolean;
BEGIN
  IF TG_TABLE_NAME='journal_plan_attachments' THEN
    SELECT definition,xmin::text::numeric=mod(pg_current_xact_id()::text::numeric,4294967296) INTO snapshot,current_fact
      FROM app.journal_plan_versions WHERE workspace_id=NEW.workspace_id AND id=NEW.plan_version_id;
    declared := snapshot->'attachmentIds' @> jsonb_build_array(NEW.attachment_id::text);
  ELSE
    SELECT document,xmin::text::numeric=mod(pg_current_xact_id()::text::numeric,4294967296) INTO snapshot,current_fact
      FROM app.journal_revisions WHERE workspace_id=NEW.workspace_id AND id=NEW.revision_id;
    IF NEW.phase='planning' THEN declared := snapshot->'plan'->'attachmentIds' @> jsonb_build_array(NEW.attachment_id::text);
    ELSE declared := EXISTS (SELECT 1 FROM jsonb_array_elements(snapshot->'review'->'attachments') a
      WHERE a->>'attachmentId'=NEW.attachment_id::text AND a->>'phase'=NEW.phase);
    END IF;
  END IF;
  IF current_fact IS DISTINCT FROM true OR declared IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Attachment link must match its new immutable journal snapshot' USING ERRCODE='23514';
  END IF;
  SELECT state INTO attachment_state FROM app.strategy_attachments WHERE workspace_id=NEW.workspace_id AND id=NEW.attachment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Attachment is not accessible' USING ERRCODE='23503'; END IF;
  IF attachment_state<>'ready' THEN RAISE EXCEPTION 'Only ready private attachments can be referenced' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE FUNCTION app.check_journal_attachment_references() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog
AS $$ DECLARE expected jsonb; actual jsonb;
BEGIN
  IF TG_TABLE_NAME='journal_plan_versions' THEN
    expected := NEW.definition->'attachmentIds';
    SELECT COALESCE(jsonb_agg(attachment_id::text),'[]'::jsonb) INTO actual FROM app.journal_plan_attachments
      WHERE workspace_id=NEW.workspace_id AND plan_version_id=NEW.id;
  ELSE
    SELECT COALESCE(jsonb_agg(value),'[]'::jsonb) INTO expected FROM (
      SELECT jsonb_build_object('attachmentId',value #>> '{}','phase','planning') AS value FROM jsonb_array_elements(NEW.document->'plan'->'attachmentIds')
      UNION ALL SELECT value FROM jsonb_array_elements(NEW.document->'review'->'attachments')
    ) reference_set;
    SELECT COALESCE(jsonb_agg(jsonb_build_object('attachmentId',attachment_id::text,'phase',phase)),'[]'::jsonb) INTO actual
      FROM app.journal_revision_attachments WHERE workspace_id=NEW.workspace_id AND revision_id=NEW.id;
  END IF;
  IF NOT (expected @> actual AND actual @> expected) THEN
    RAISE EXCEPTION 'Journal attachment reference set must exactly match its immutable snapshot' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;
CREATE FUNCTION app.guard_journal_attachment_removal() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog
AS $$ BEGIN
  IF NEW.state='removed' AND (EXISTS (SELECT 1 FROM app.journal_revision_attachments WHERE workspace_id=OLD.workspace_id AND attachment_id=OLD.id)
    OR EXISTS (SELECT 1 FROM app.journal_plan_attachments WHERE workspace_id=OLD.workspace_id AND attachment_id=OLD.id)) THEN
    RAISE EXCEPTION 'Historical journal evidence cannot be removed' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER journal_entries_identity_guard BEFORE INSERT OR UPDATE ON app.journal_entries FOR EACH ROW EXECUTE FUNCTION app.guard_journal_entry();
CREATE TRIGGER journal_revisions_sequence_guard BEFORE INSERT ON app.journal_revisions FOR EACH ROW EXECUTE FUNCTION app.guard_journal_revision();
CREATE CONSTRAINT TRIGGER journal_entries_pointer_guard AFTER INSERT OR UPDATE ON app.journal_entries DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.check_journal_pointer();
CREATE CONSTRAINT TRIGGER journal_revisions_pointer_guard AFTER INSERT ON app.journal_revisions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.check_journal_pointer();
CREATE TRIGGER journal_plan_versions_sequence_guard BEFORE INSERT ON app.journal_plan_versions FOR EACH ROW EXECUTE FUNCTION app.guard_journal_plan_version();
CREATE TRIGGER journal_risk_additions_active_guard BEFORE INSERT ON app.journal_risk_additions FOR EACH ROW EXECUTE FUNCTION app.guard_journal_risk_addition();
CREATE TRIGGER journal_plan_commitments_original_guard BEFORE INSERT ON app.journal_plan_commitments FOR EACH ROW EXECUTE FUNCTION app.guard_journal_commitment();
CREATE TRIGGER journal_revision_attachments_reference_guard BEFORE INSERT ON app.journal_revision_attachments FOR EACH ROW EXECUTE FUNCTION app.guard_journal_attachment_reference();
CREATE TRIGGER journal_plan_attachments_reference_guard BEFORE INSERT ON app.journal_plan_attachments FOR EACH ROW EXECUTE FUNCTION app.guard_journal_attachment_reference();
CREATE CONSTRAINT TRIGGER journal_revisions_attachments_guard AFTER INSERT ON app.journal_revisions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.check_journal_attachment_references();
CREATE CONSTRAINT TRIGGER journal_plan_versions_attachments_guard AFTER INSERT ON app.journal_plan_versions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.check_journal_attachment_references();
CREATE CONSTRAINT TRIGGER journal_commands_complete AFTER INSERT ON app.journal_commands DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.check_journal_command();
CREATE TRIGGER strategy_attachments_journal_removal_guard BEFORE UPDATE ON app.strategy_attachments FOR EACH ROW EXECUTE FUNCTION app.guard_journal_attachment_removal();
DO $$ DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['journal_commands','journal_plan_versions','journal_plan_commitments','journal_risk_additions','journal_revisions','journal_revision_attachments','journal_plan_attachments'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON app.%I FOR EACH ROW EXECUTE FUNCTION app.reject_journal_history_mutation()',table_name || '_immutable',table_name);
  END LOOP;
  FOREACH table_name IN ARRAY ARRAY['journal_plan_versions','journal_plan_commitments','journal_risk_additions','journal_revisions'] LOOP
    EXECUTE format('CREATE CONSTRAINT TRIGGER %I AFTER INSERT ON app.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.check_journal_fact()',table_name || '_atomic_fact',table_name);
  END LOOP;
END $$;
CREATE TRIGGER journal_entries_no_delete BEFORE DELETE ON app.journal_entries FOR EACH ROW EXECUTE FUNCTION app.reject_journal_history_mutation();
--> statement-breakpoint
DO $$ DECLARE function_name text;
BEGIN
  FOREACH function_name IN ARRAY ARRAY['journal_text_length(text)','journal_uuid(jsonb)','journal_decimal(jsonb,boolean)',
    'valid_journal_plan(jsonb)','valid_journal_document(jsonb)','reject_journal_history_mutation()',
    'guard_journal_entry()','guard_journal_revision()','check_journal_pointer()','guard_journal_plan_version()',
    'guard_journal_risk_addition()','guard_journal_commitment()','check_journal_references(uuid,uuid,jsonb,boolean)','check_journal_fact()',
    'check_journal_command()','guard_journal_attachment_reference()','check_journal_attachment_references()',
    'guard_journal_attachment_removal()'] LOOP
    EXECUTE 'ALTER FUNCTION app.' || function_name || ' OWNER TO journal_migrator';
    EXECUTE 'REVOKE ALL ON FUNCTION app.' || function_name || ' FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION app.' || function_name || ' TO journal_app';
  END LOOP;
END $$;
UPDATE app.schema_metadata SET version=6 WHERE singleton=true;
