CREATE TABLE "app"."account_cash_events" (
	"workspace_id" uuid NOT NULL,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" text DEFAULT app.current_actor_id() NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	"command_id" uuid NOT NULL,
	"source_revision" integer NOT NULL,
	"account_id" uuid NOT NULL,
	"cash_bucket_id" uuid NOT NULL,
	"currency_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"amount_raw" text NOT NULL,
	"amount" numeric(78, 36) GENERATED ALWAYS AS (app.financial_decimal("amount_raw")) STORED,
	"related_income_id" uuid,
	"description" text DEFAULT '' NOT NULL,
	"economic_at" timestamp with time zone NOT NULL,
	"ordering_key" text NOT NULL,
	CONSTRAINT "account_cash_events_pkey" PRIMARY KEY("workspace_id","id"),
	CONSTRAINT "account_cash_events_id_check" CHECK (id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
	CONSTRAINT "account_cash_events_source_revision_check" CHECK ("app"."account_cash_events"."source_revision" > 0),
	CONSTRAINT "account_cash_events_kind_check" CHECK ("app"."account_cash_events"."kind" IN ('dividend','interest','tax','financing','interest-expense','other-expense')),
	CONSTRAINT "account_cash_events_amount_check" CHECK ("app"."account_cash_events"."amount" <> 0 AND ("app"."account_cash_events"."kind" NOT IN ('dividend','interest') OR "app"."account_cash_events"."amount" > 0)),
	CONSTRAINT "account_cash_events_related_income_check" CHECK ("app"."account_cash_events"."related_income_id" IS NULL OR "app"."account_cash_events"."kind" = 'tax'),
	CONSTRAINT "account_cash_events_description_check" CHECK (app.journal_text_length("app"."account_cash_events"."description") <= 4000),
	CONSTRAINT "account_cash_events_ordering_key_check" CHECK ("app"."account_cash_events"."ordering_key" ~ '^(0|[1-9][0-9]*)$' AND char_length("app"."account_cash_events"."ordering_key") <= 80)
);
--> statement-breakpoint
ALTER TABLE "app"."account_cash_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."cash_transfer_receipts" (
	"workspace_id" uuid NOT NULL,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" text DEFAULT app.current_actor_id() NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	"command_id" uuid NOT NULL,
	"source_revision" integer NOT NULL,
	"transfer_id" uuid NOT NULL,
	"economic_at" timestamp with time zone NOT NULL,
	"ordering_key" text NOT NULL,
	CONSTRAINT "cash_transfer_receipts_pkey" PRIMARY KEY("workspace_id","id"),
	CONSTRAINT "cash_transfer_receipts_transfer_key" UNIQUE("workspace_id","transfer_id"),
	CONSTRAINT "cash_transfer_receipts_command_key" UNIQUE("workspace_id","command_id"),
	CONSTRAINT "cash_transfer_receipts_id_check" CHECK (id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
	CONSTRAINT "cash_transfer_receipts_source_revision_check" CHECK ("app"."cash_transfer_receipts"."source_revision" > 0),
	CONSTRAINT "cash_transfer_receipts_ordering_key_check" CHECK ("app"."cash_transfer_receipts"."ordering_key" ~ '^(0|[1-9][0-9]*)$' AND char_length("app"."cash_transfer_receipts"."ordering_key") <= 80)
);
--> statement-breakpoint
ALTER TABLE "app"."cash_transfer_receipts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."cash_transfers" (
	"workspace_id" uuid NOT NULL,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" text DEFAULT app.current_actor_id() NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	"command_id" uuid NOT NULL,
	"source_revision" integer NOT NULL,
	"source_account_id" uuid NOT NULL,
	"destination_account_id" uuid NOT NULL,
	"source_bucket_id" uuid NOT NULL,
	"destination_bucket_id" uuid NOT NULL,
	"currency_id" uuid NOT NULL,
	"amount_raw" text NOT NULL,
	"amount" numeric(78, 36) GENERATED ALWAYS AS (app.financial_decimal("amount_raw")) STORED,
	"economic_at" timestamp with time zone NOT NULL,
	"ordering_key" text NOT NULL,
	"description" text NOT NULL,
	CONSTRAINT "cash_transfers_pkey" PRIMARY KEY("workspace_id","id"),
	CONSTRAINT "cash_transfers_command_key" UNIQUE("workspace_id","command_id"),
	CONSTRAINT "cash_transfers_id_check" CHECK (id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
	CONSTRAINT "cash_transfers_source_revision_check" CHECK ("app"."cash_transfers"."source_revision" > 0),
	CONSTRAINT "cash_transfers_amount_check" CHECK ("app"."cash_transfers"."amount" > 0),
	CONSTRAINT "cash_transfers_accounts_check" CHECK ("app"."cash_transfers"."source_account_id" <> "app"."cash_transfers"."destination_account_id"),
	CONSTRAINT "cash_transfers_description_check" CHECK (app.journal_text_length(app.journal_trim("app"."cash_transfers"."description")) BETWEEN 1 AND 4000),
	CONSTRAINT "cash_transfers_ordering_key_check" CHECK ("app"."cash_transfers"."ordering_key" ~ '^(0|[1-9][0-9]*)$' AND char_length("app"."cash_transfers"."ordering_key") <= 80)
);
--> statement-breakpoint
ALTER TABLE "app"."cash_transfers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."portfolio_version_accounts" (
	"workspace_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"actor_id" text DEFAULT app.current_actor_id() NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "portfolio_version_accounts_pkey" PRIMARY KEY("workspace_id","version_id","account_id")
);
--> statement-breakpoint
ALTER TABLE "app"."portfolio_version_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."portfolio_versions" (
	"workspace_id" uuid NOT NULL,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" text DEFAULT app.current_actor_id() NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	"command_id" uuid NOT NULL,
	"source_revision" integer NOT NULL,
	"portfolio_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"environment" text NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"reason" text DEFAULT 'Created' NOT NULL,
	CONSTRAINT "portfolio_versions_pkey" PRIMARY KEY("workspace_id","id"),
	CONSTRAINT "portfolio_versions_version_key" UNIQUE("workspace_id","portfolio_id","version"),
	CONSTRAINT "portfolio_versions_command_key" UNIQUE("workspace_id","command_id"),
	CONSTRAINT "portfolio_versions_id_check" CHECK (id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
	CONSTRAINT "portfolio_versions_source_revision_check" CHECK ("app"."portfolio_versions"."source_revision" > 0),
	CONSTRAINT "portfolio_versions_version_check" CHECK ("app"."portfolio_versions"."version" > 0),
	CONSTRAINT "portfolio_versions_name_check" CHECK (app.journal_text_length(app.journal_trim("app"."portfolio_versions"."name")) BETWEEN 1 AND 160),
	CONSTRAINT "portfolio_versions_description_check" CHECK (app.journal_text_length("app"."portfolio_versions"."description") <= 4000),
	CONSTRAINT "portfolio_versions_reason_check" CHECK (app.journal_text_length(app.journal_trim("app"."portfolio_versions"."reason")) BETWEEN 1 AND 2000),
	CONSTRAINT "portfolio_versions_environment_check" CHECK ("app"."portfolio_versions"."environment" IN ('live','paper'))
);
--> statement-breakpoint
ALTER TABLE "app"."portfolio_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."portfolios" (
	"workspace_id" uuid NOT NULL,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" text DEFAULT app.current_actor_id() NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	"command_id" uuid NOT NULL,
	"source_revision" integer NOT NULL,
	CONSTRAINT "portfolios_pkey" PRIMARY KEY("workspace_id","id"),
	CONSTRAINT "portfolios_command_key" UNIQUE("workspace_id","command_id"),
	CONSTRAINT "portfolios_id_check" CHECK (id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
	CONSTRAINT "portfolios_source_revision_check" CHECK ("app"."portfolios"."source_revision" > 0)
);
--> statement-breakpoint
ALTER TABLE "app"."portfolios" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."ledger_events" ADD COLUMN "account_cash_event_id" uuid;--> statement-breakpoint
ALTER TABLE "app"."ledger_events" ADD COLUMN "cash_transfer_id" uuid;--> statement-breakpoint
ALTER TABLE "app"."ledger_events" ADD COLUMN "cash_transfer_receipt_id" uuid;--> statement-breakpoint
ALTER TABLE "app"."account_cash_events" ADD CONSTRAINT "account_cash_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."account_cash_events" ADD CONSTRAINT "account_cash_events_command_fkey" FOREIGN KEY ("workspace_id","command_id") REFERENCES "app"."financial_commands"("workspace_id","id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "app"."account_cash_events" ADD CONSTRAINT "account_cash_events_bucket_fkey" FOREIGN KEY ("workspace_id","cash_bucket_id","account_id","currency_id") REFERENCES "app"."cash_buckets"("workspace_id","id","account_id","currency_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."account_cash_events" ADD CONSTRAINT "account_cash_events_related_income_fkey" FOREIGN KEY ("workspace_id","related_income_id") REFERENCES "app"."account_cash_events"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."cash_transfer_receipts" ADD CONSTRAINT "cash_transfer_receipts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."cash_transfer_receipts" ADD CONSTRAINT "cash_transfer_receipts_command_fkey" FOREIGN KEY ("workspace_id","command_id") REFERENCES "app"."financial_commands"("workspace_id","id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "app"."cash_transfer_receipts" ADD CONSTRAINT "cash_transfer_receipts_transfer_fkey" FOREIGN KEY ("workspace_id","transfer_id") REFERENCES "app"."cash_transfers"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."cash_transfers" ADD CONSTRAINT "cash_transfers_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."cash_transfers" ADD CONSTRAINT "cash_transfers_command_fkey" FOREIGN KEY ("workspace_id","command_id") REFERENCES "app"."financial_commands"("workspace_id","id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "app"."cash_transfers" ADD CONSTRAINT "cash_transfers_source_bucket_fkey" FOREIGN KEY ("workspace_id","source_bucket_id","source_account_id","currency_id") REFERENCES "app"."cash_buckets"("workspace_id","id","account_id","currency_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."cash_transfers" ADD CONSTRAINT "cash_transfers_destination_bucket_fkey" FOREIGN KEY ("workspace_id","destination_bucket_id","destination_account_id","currency_id") REFERENCES "app"."cash_buckets"("workspace_id","id","account_id","currency_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."cash_transfers" ADD CONSTRAINT "cash_transfers_currency_fkey" FOREIGN KEY ("workspace_id","currency_id") REFERENCES "app"."currencies"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."portfolio_version_accounts" ADD CONSTRAINT "portfolio_version_accounts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."portfolio_version_accounts" ADD CONSTRAINT "portfolio_version_accounts_version_fkey" FOREIGN KEY ("workspace_id","version_id") REFERENCES "app"."portfolio_versions"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."portfolio_version_accounts" ADD CONSTRAINT "portfolio_version_accounts_account_fkey" FOREIGN KEY ("workspace_id","account_id") REFERENCES "app"."accounts"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."portfolio_versions" ADD CONSTRAINT "portfolio_versions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."portfolio_versions" ADD CONSTRAINT "portfolio_versions_portfolio_fkey" FOREIGN KEY ("workspace_id","portfolio_id") REFERENCES "app"."portfolios"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."portfolio_versions" ADD CONSTRAINT "portfolio_versions_command_fkey" FOREIGN KEY ("workspace_id","command_id") REFERENCES "app"."financial_commands"("workspace_id","id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "app"."portfolios" ADD CONSTRAINT "portfolios_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."portfolios" ADD CONSTRAINT "portfolios_command_fkey" FOREIGN KEY ("workspace_id","command_id") REFERENCES "app"."financial_commands"("workspace_id","id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
CREATE INDEX "account_cash_events_account_time_idx" ON "app"."account_cash_events" USING btree ("workspace_id","account_id","economic_at","id");--> statement-breakpoint
CREATE INDEX "cash_transfer_receipts_time_idx" ON "app"."cash_transfer_receipts" USING btree ("workspace_id","economic_at","id");--> statement-breakpoint
CREATE INDEX "cash_transfers_time_idx" ON "app"."cash_transfers" USING btree ("workspace_id","economic_at","id");--> statement-breakpoint
CREATE INDEX "portfolio_versions_history_idx" ON "app"."portfolio_versions" USING btree ("workspace_id","portfolio_id","version");
--> statement-breakpoint
-- New source links are relational evidence. Controls never represent owned cash.
ALTER TABLE app.ledger_events
  ADD CONSTRAINT ledger_events_account_cash_fkey FOREIGN KEY(workspace_id,account_cash_event_id) REFERENCES app.account_cash_events(workspace_id,id) DEFERRABLE INITIALLY DEFERRED,
  ADD CONSTRAINT ledger_events_cash_transfer_fkey FOREIGN KEY(workspace_id,cash_transfer_id) REFERENCES app.cash_transfers(workspace_id,id) DEFERRABLE INITIALLY DEFERRED,
  ADD CONSTRAINT ledger_events_cash_receipt_fkey FOREIGN KEY(workspace_id,cash_transfer_receipt_id) REFERENCES app.cash_transfer_receipts(workspace_id,id) DEFERRABLE INITIALLY DEFERRED,
  ADD CONSTRAINT ledger_events_account_cash_key UNIQUE(workspace_id,account_cash_event_id),
  ADD CONSTRAINT ledger_events_cash_transfer_key UNIQUE(workspace_id,cash_transfer_id),
  ADD CONSTRAINT ledger_events_cash_receipt_key UNIQUE(workspace_id,cash_transfer_receipt_id),
  ADD CONSTRAINT ledger_events_accounting_source_check CHECK (
    num_nonnulls(execution_id,fee_id,cash_movement_id,fx_conversion_id,reversal_of_id,account_cash_event_id,cash_transfer_id,cash_transfer_receipt_id) <= 1
    AND ((account_cash_event_id IS NOT NULL) = (kind IN ('account-income','account-tax','account-expense')))
    AND ((cash_transfer_id IS NOT NULL) = (kind = 'cash-transfer-departure'))
    AND ((cash_transfer_receipt_id IS NOT NULL) = (kind = 'cash-transfer-receipt'))
  );
ALTER TABLE app.account_cash_events ADD CONSTRAINT account_cash_events_finite_time_check CHECK(isfinite(economic_at));
ALTER TABLE app.cash_transfers ADD CONSTRAINT cash_transfers_finite_time_check CHECK(isfinite(economic_at));
ALTER TABLE app.cash_transfer_receipts ADD CONSTRAINT cash_transfer_receipts_finite_time_check CHECK(isfinite(economic_at));

--> statement-breakpoint
CREATE FUNCTION app.reject_accounting_history_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog
AS $$ BEGIN RAISE EXCEPTION 'Accounting source and portfolio history are immutable' USING ERRCODE='55000'; END $$;

CREATE FUNCTION app.guard_accounting_source() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog
AS $$ DECLARE parent_command uuid; parent_actor text; parent_transaction numeric; prior_version integer; prior_revision integer; prior_archived boolean;
BEGIN
  IF current_user='journal_app' AND NEW.actor_id IS DISTINCT FROM app.current_actor_id() THEN
    RAISE EXCEPTION 'Accounting source actor must be the verified current actor' USING ERRCODE='42501';
  END IF;
  IF TG_TABLE_NAME='portfolio_version_accounts' THEN
    SELECT command_id,actor_id,xmin::text::numeric INTO parent_command,parent_actor,parent_transaction
      FROM app.portfolio_versions WHERE workspace_id=NEW.workspace_id AND id=NEW.version_id;
    IF parent_transaction IS DISTINCT FROM mod(pg_current_xact_id()::text::numeric,4294967296) OR parent_actor IS DISTINCT FROM NEW.actor_id THEN
      RAISE EXCEPTION 'Portfolio membership must be recorded with its new immutable version' USING ERRCODE='23514';
    END IF;
  ELSE parent_command:=NEW.command_id;
  END IF;
  IF EXISTS(SELECT 1 FROM app.financial_commands WHERE workspace_id=NEW.workspace_id AND id=parent_command) THEN
    RAISE EXCEPTION 'Committed financial command cannot receive accounting facts' USING ERRCODE='23514';
  END IF;
  IF TG_TABLE_NAME='portfolio_versions' THEN
    SELECT version,source_revision,archived INTO prior_version,prior_revision,prior_archived
      FROM app.portfolio_versions WHERE workspace_id=NEW.workspace_id AND portfolio_id=NEW.portfolio_id ORDER BY version DESC LIMIT 1;
    IF NEW.version<>coalesce(prior_version,0)+1 OR coalesce(prior_archived,false) OR (prior_revision IS NOT NULL AND NEW.source_revision<=prior_revision) THEN
      RAISE EXCEPTION 'Portfolio versions must advance exactly once without rewriting archived history' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION app.check_accounting_source_command() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog
AS $$ DECLARE command app.financial_commands%ROWTYPE; command_transaction numeric; expected_kind text; related_command uuid;
BEGIN
  SELECT * INTO command FROM app.financial_commands WHERE workspace_id=NEW.workspace_id AND id=NEW.command_id;
  SELECT xmin::text::numeric INTO command_transaction FROM app.financial_commands WHERE workspace_id=NEW.workspace_id AND id=NEW.command_id;
  IF command.source_revision IS DISTINCT FROM NEW.source_revision OR command.actor_id IS DISTINCT FROM NEW.actor_id
    OR command_transaction IS DISTINCT FROM mod(pg_current_xact_id()::text::numeric,4294967296) THEN
    RAISE EXCEPTION 'Accounting source must belong to its new atomic financial command and actor' USING ERRCODE='23514';
  END IF;
  IF TG_TABLE_NAME='portfolios' THEN expected_kind:='portfolio-created';
  ELSIF TG_TABLE_NAME='portfolio_versions' THEN
    expected_kind:=CASE WHEN NEW.version=1 THEN 'portfolio-created' WHEN NEW.archived THEN 'portfolio-archived' ELSE 'portfolio-version-created' END;
  ELSIF TG_TABLE_NAME='cash_transfers' THEN expected_kind:='owned-cash-transfer-departed';
  ELSIF TG_TABLE_NAME='cash_transfer_receipts' THEN
    SELECT command_id INTO related_command FROM app.cash_transfers WHERE workspace_id=NEW.workspace_id AND id=NEW.transfer_id;
    expected_kind:=CASE WHEN related_command=NEW.command_id THEN 'owned-cash-transfer-departed' ELSE 'owned-cash-transfer-received' END;
  ELSIF NEW.kind IN ('dividend','interest') THEN expected_kind:='account-income-recorded';
  ELSIF NEW.kind='tax' THEN
    IF command.kind='account-income-recorded' AND NEW.related_income_id IS NOT NULL THEN
      SELECT command_id INTO related_command FROM app.account_cash_events WHERE workspace_id=NEW.workspace_id AND id=NEW.related_income_id;
      IF related_command IS DISTINCT FROM NEW.command_id THEN
        RAISE EXCEPTION 'Income command withholding must refer to its own gross income fact' USING ERRCODE='23514';
      END IF;
      expected_kind:='account-income-recorded';
    ELSE expected_kind:='account-tax-recorded'; END IF;
  ELSE expected_kind:='account-expense-recorded'; END IF;
  IF command.kind IS DISTINCT FROM expected_kind OR NOT EXISTS(
    SELECT 1 FROM app.audit_events WHERE workspace_id=NEW.workspace_id AND id=command.audit_event_id
      AND actor_id=NEW.actor_id AND action='financial.'||expected_kind
  ) OR NOT EXISTS(
    SELECT 1 FROM app.outbox_events WHERE workspace_id=NEW.workspace_id AND command_id=NEW.command_id
      AND source_revision=NEW.source_revision AND event_kind='financial.'||expected_kind
  ) THEN RAISE EXCEPTION 'Accounting source requires its classified financial command, audit and outbox evidence' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END $$;

CREATE FUNCTION app.check_portfolio_definition() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog
AS $$ DECLARE target_version uuid; definition app.portfolio_versions%ROWTYPE; membership_count bigint; identity app.portfolios%ROWTYPE;
BEGIN
  IF TG_TABLE_NAME='portfolios' THEN
    SELECT * INTO definition FROM app.portfolio_versions WHERE workspace_id=NEW.workspace_id AND portfolio_id=NEW.id AND version=1;
    IF definition.command_id IS DISTINCT FROM NEW.command_id OR definition.source_revision IS DISTINCT FROM NEW.source_revision OR definition.actor_id IS DISTINCT FROM NEW.actor_id THEN
      RAISE EXCEPTION 'Portfolio identity requires its first version in the same financial command' USING ERRCODE='23514';
    END IF;
    target_version:=definition.id;
  ELSIF TG_TABLE_NAME='portfolio_versions' THEN target_version:=NEW.id;
  ELSE target_version:=NEW.version_id;
  END IF;
  SELECT * INTO definition FROM app.portfolio_versions WHERE workspace_id=NEW.workspace_id AND id=target_version;
  SELECT * INTO identity FROM app.portfolios WHERE workspace_id=NEW.workspace_id AND id=definition.portfolio_id;
  IF definition.version=1 AND (definition.command_id IS DISTINCT FROM identity.command_id OR definition.source_revision IS DISTINCT FROM identity.source_revision) THEN
    RAISE EXCEPTION 'Initial portfolio version must belong to its identity command' USING ERRCODE='23514';
  END IF;
  SELECT count(*) INTO membership_count FROM app.portfolio_version_accounts WHERE workspace_id=NEW.workspace_id AND version_id=target_version;
  IF definition.id IS NULL OR membership_count NOT BETWEEN 1 AND 100 OR EXISTS(
    SELECT 1 FROM app.portfolio_version_accounts m JOIN app.accounts a ON a.workspace_id=m.workspace_id AND a.id=m.account_id
      WHERE m.workspace_id=NEW.workspace_id AND m.version_id=target_version AND (a.environment<>definition.environment OR m.actor_id<>definition.actor_id)
  ) THEN RAISE EXCEPTION 'Portfolio version requires one to one hundred accounts in its declared environment' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END $$;

CREATE FUNCTION app.check_accounting_evidence() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog
AS $$ DECLARE target_workspace uuid:=NEW.workspace_id; target_event uuid; event app.ledger_events%ROWTYPE;
  cash_source app.account_cash_events%ROWTYPE; transfer app.cash_transfers%ROWTYPE; receipt app.cash_transfer_receipts%ROWTYPE;
  related app.account_cash_events%ROWTYPE; expected_bucket uuid; expected_currency uuid; expected_command uuid; expected_revision integer;
  expected_amount numeric; expected_time timestamptz; expected_actor text; expected_kind text; posting_count bigint; cash_count bigint; cash_amount numeric;
BEGIN
  IF TG_TABLE_NAME='ledger_events' THEN
    target_event:=NEW.id;
    IF num_nonnulls(NEW.account_cash_event_id,NEW.cash_transfer_id,NEW.cash_transfer_receipt_id)=0 THEN RETURN NULL; END IF;
  ELSIF TG_TABLE_NAME='postings' THEN target_event:=NEW.ledger_event_id;
  ELSIF TG_TABLE_NAME='account_cash_events' THEN
    SELECT id INTO target_event FROM app.ledger_events WHERE workspace_id=target_workspace AND account_cash_event_id=NEW.id;
  ELSIF TG_TABLE_NAME='cash_transfers' THEN
    SELECT id INTO target_event FROM app.ledger_events WHERE workspace_id=target_workspace AND cash_transfer_id=NEW.id;
  ELSE
    SELECT id INTO target_event FROM app.ledger_events WHERE workspace_id=target_workspace AND cash_transfer_receipt_id=NEW.id;
  END IF;
  SELECT * INTO event FROM app.ledger_events WHERE workspace_id=target_workspace AND id=target_event;
  IF TG_TABLE_NAME='postings' AND num_nonnulls(event.account_cash_event_id,event.cash_transfer_id,event.cash_transfer_receipt_id)=0 THEN RETURN NULL; END IF;
  IF event.id IS NULL THEN RAISE EXCEPTION 'Accounting cash source requires its exactly posted ledger event' USING ERRCODE='23514'; END IF;
  IF event.account_cash_event_id IS NOT NULL THEN
    SELECT * INTO cash_source FROM app.account_cash_events WHERE workspace_id=target_workspace AND id=event.account_cash_event_id;
    expected_bucket:=cash_source.cash_bucket_id; expected_currency:=cash_source.currency_id; expected_command:=cash_source.command_id;
    expected_revision:=cash_source.source_revision; expected_time:=cash_source.economic_at; expected_actor:=cash_source.actor_id;
    IF cash_source.kind IN ('dividend','interest') THEN expected_kind:='account-income'; expected_amount:=cash_source.amount;
    ELSIF cash_source.kind='tax' THEN expected_kind:='account-tax'; expected_amount:=-cash_source.amount;
    ELSE expected_kind:='account-expense'; expected_amount:=-cash_source.amount; END IF;
    IF cash_source.related_income_id IS NOT NULL THEN
      SELECT * INTO related FROM app.account_cash_events WHERE workspace_id=target_workspace AND id=cash_source.related_income_id;
      IF related.kind NOT IN ('dividend','interest') OR related.account_id<>cash_source.account_id OR related.currency_id<>cash_source.currency_id
        OR related.cash_bucket_id<>cash_source.cash_bucket_id OR related.economic_at>cash_source.economic_at THEN
        RAISE EXCEPTION 'Tax income reference must match the same account, bucket, currency and prior income evidence' USING ERRCODE='23514';
      END IF;
    END IF;
  ELSE
    IF event.cash_transfer_receipt_id IS NOT NULL THEN
      SELECT * INTO receipt FROM app.cash_transfer_receipts WHERE workspace_id=target_workspace AND id=event.cash_transfer_receipt_id;
      SELECT * INTO transfer FROM app.cash_transfers WHERE workspace_id=target_workspace AND id=receipt.transfer_id;
      IF receipt.economic_at<transfer.economic_at OR receipt.source_revision<transfer.source_revision
        OR (receipt.economic_at=transfer.economic_at AND receipt.ordering_key::numeric<transfer.ordering_key::numeric)
        OR (receipt.command_id=transfer.command_id AND receipt.economic_at<>transfer.economic_at) THEN
        RAISE EXCEPTION 'Cash transfer receipt must follow departure with separate evidence for delayed settlement' USING ERRCODE='23514';
      END IF;
      expected_bucket:=transfer.destination_bucket_id; expected_amount:=transfer.amount; expected_command:=receipt.command_id;
      expected_revision:=receipt.source_revision; expected_time:=receipt.economic_at; expected_actor:=receipt.actor_id; expected_kind:='cash-transfer-receipt';
    ELSE
      SELECT * INTO transfer FROM app.cash_transfers WHERE workspace_id=target_workspace AND id=event.cash_transfer_id;
      expected_bucket:=transfer.source_bucket_id; expected_amount:=-transfer.amount; expected_command:=transfer.command_id;
      expected_revision:=transfer.source_revision; expected_time:=transfer.economic_at; expected_actor:=transfer.actor_id; expected_kind:='cash-transfer-departure';
    END IF;
    expected_currency:=transfer.currency_id;
    IF (SELECT environment FROM app.accounts WHERE workspace_id=target_workspace AND id=transfer.source_account_id)
      IS DISTINCT FROM (SELECT environment FROM app.accounts WHERE workspace_id=target_workspace AND id=transfer.destination_account_id) THEN
      RAISE EXCEPTION 'Owned cash transfer must retain one live or paper environment' USING ERRCODE='23514';
    END IF;
  END IF;
  IF event.command_id IS DISTINCT FROM expected_command OR event.source_revision IS DISTINCT FROM expected_revision
    OR event.currency_id IS DISTINCT FROM expected_currency OR event.economic_at IS DISTINCT FROM expected_time
    OR event.actor_id IS DISTINCT FROM expected_actor OR event.kind IS DISTINCT FROM expected_kind THEN
    RAISE EXCEPTION 'Accounting ledger event must match immutable source command, revision, currency, time, actor and classification' USING ERRCODE='23514';
  END IF;
  SELECT count(*),count(*) FILTER(WHERE cash_bucket_id=expected_bucket),coalesce(sum(amount) FILTER(WHERE cash_bucket_id=expected_bucket),0)
    INTO posting_count,cash_count,cash_amount FROM app.postings WHERE workspace_id=target_workspace AND ledger_event_id=target_event;
  IF posting_count<>2 OR cash_count<>1 OR cash_amount IS DISTINCT FROM expected_amount OR EXISTS(
    SELECT 1 FROM app.postings WHERE workspace_id=target_workspace AND ledger_event_id=target_event
      AND (actor_id IS DISTINCT FROM expected_actor OR (cash_bucket_id IS NOT NULL AND cash_bucket_id<>expected_bucket))
  ) THEN RAISE EXCEPTION 'Accounting source must post its exact native amount once to one evidenced cash bucket with one balancing control' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END $$;

--> statement-breakpoint
DO $$ DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['portfolios','portfolio_versions','portfolio_version_accounts','account_cash_events','cash_transfers','cash_transfer_receipts'] LOOP
    EXECUTE format('ALTER TABLE app.%I OWNER TO journal_migrator',table_name);
    EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format('CREATE POLICY %I ON app.%I FOR SELECT TO journal_app USING(workspace_id=app.current_workspace_id() AND app.actor_role(workspace_id) IS NOT NULL)',table_name||'_read',table_name);
    EXECUTE format('CREATE POLICY %I ON app.%I FOR INSERT TO journal_app WITH CHECK(workspace_id=app.current_workspace_id() AND actor_id=app.current_actor_id() AND app.actor_role(workspace_id) IN (''owner'',''editor''))',table_name||'_insert',table_name);
    EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC',table_name);
    EXECUTE format('GRANT SELECT,INSERT ON app.%I TO journal_app',table_name);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON app.%I FOR EACH ROW EXECUTE FUNCTION app.reject_accounting_history_mutation()',table_name||'_immutable',table_name);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT ON app.%I FOR EACH ROW EXECUTE FUNCTION app.guard_accounting_source()',table_name||'_new_source',table_name);
    IF table_name<>'portfolio_version_accounts' THEN
      EXECUTE format('CREATE CONSTRAINT TRIGGER %I AFTER INSERT ON app.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.check_accounting_source_command()',table_name||'_command',table_name);
    END IF;
    IF table_name IN ('portfolios','portfolio_versions','portfolio_version_accounts') THEN
      EXECUTE format('CREATE CONSTRAINT TRIGGER %I AFTER INSERT ON app.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.check_portfolio_definition()',table_name||'_definition',table_name);
    ELSE
      EXECUTE format('CREATE CONSTRAINT TRIGGER %I AFTER INSERT ON app.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.check_accounting_evidence()',table_name||'_evidence',table_name);
    END IF;
  END LOOP;
END $$;
CREATE CONSTRAINT TRIGGER ledger_events_accounting_evidence AFTER INSERT ON app.ledger_events DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.check_accounting_evidence();
CREATE CONSTRAINT TRIGGER postings_accounting_evidence AFTER INSERT ON app.postings DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.check_accounting_evidence();
ALTER FUNCTION app.reject_accounting_history_mutation() OWNER TO journal_migrator;
ALTER FUNCTION app.guard_accounting_source() OWNER TO journal_migrator;
ALTER FUNCTION app.check_accounting_source_command() OWNER TO journal_migrator;
ALTER FUNCTION app.check_portfolio_definition() OWNER TO journal_migrator;
ALTER FUNCTION app.check_accounting_evidence() OWNER TO journal_migrator;
REVOKE ALL ON FUNCTION app.reject_accounting_history_mutation(),app.guard_accounting_source(),app.check_accounting_source_command(),app.check_portfolio_definition(),app.check_accounting_evidence() FROM PUBLIC;
UPDATE app.schema_metadata SET version=8 WHERE singleton=true;
