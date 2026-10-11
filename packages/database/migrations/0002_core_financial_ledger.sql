-- Additive reviewed financial ledger; no existing platform row is rewritten.
-- Source decimals validate lexical precision before the generated NUMERIC cast.
CREATE FUNCTION app.financial_decimal(raw_value text) RETURNS numeric
LANGUAGE plpgsql IMMUTABLE STRICT SET search_path = pg_catalog
AS $$
DECLARE unsigned text := ltrim(raw_value, '-');
BEGIN
  IF char_length(raw_value) > 80
     OR raw_value !~ '^(0|-?([1-9][0-9]*|0)(\.[0-9]*[1-9])?)$'
     OR raw_value = '-0'
     OR char_length(split_part(unsigned, '.', 1)) > 42
     OR char_length(split_part(unsigned, '.', 2)) > 36 THEN
    RAISE EXCEPTION 'Financial decimal is not canonical or exceeds source precision' USING ERRCODE = '22003';
  END IF;
  RETURN raw_value::numeric;
END $$;
ALTER FUNCTION app.financial_decimal(text) OWNER TO journal_migrator;
REVOKE ALL ON FUNCTION app.financial_decimal(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.financial_decimal(text) TO journal_app;
--> statement-breakpoint
CREATE TABLE app.financial_state (
  workspace_id uuid PRIMARY KEY REFERENCES app.workspaces(id),
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0)
);
INSERT INTO app.financial_state(workspace_id, revision) SELECT id, 0 FROM app.workspaces;

CREATE TABLE app.currencies (
  workspace_id uuid NOT NULL REFERENCES app.workspaces(id),
  id uuid NOT NULL DEFAULT gen_random_uuid() CHECK (id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  actor_id text NOT NULL DEFAULT app.current_actor_id(),
  origin text NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual','import','broker','provider','calculated')),
  created_at timestamptz NOT NULL DEFAULT now(),
  namespace text NOT NULL,
  code text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('fiat','digital','custom')),
  unit_identity text NOT NULL,
  name text NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  archived_at timestamptz,
  PRIMARY KEY (workspace_id,id),
  UNIQUE (workspace_id, namespace, code),
  UNIQUE (workspace_id, unit_identity)
);

CREATE TABLE app.currency_convention_versions (
  workspace_id uuid NOT NULL REFERENCES app.workspaces(id),
  id uuid NOT NULL DEFAULT gen_random_uuid() CHECK (id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  actor_id text NOT NULL DEFAULT app.current_actor_id(),
  origin text NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual','import','broker','provider','calculated')),
  created_at timestamptz NOT NULL DEFAULT now(),
  currency_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  display_scale integer NOT NULL CHECK (display_scale BETWEEN 0 AND 36),
  settlement_increment_raw text NOT NULL, settlement_increment numeric(78,36) GENERATED ALWAYS AS (app.financial_decimal(settlement_increment_raw)) STORED CHECK (settlement_increment > 0),
  rounding text NOT NULL DEFAULT 'HALF_EVEN' CHECK (rounding = 'HALF_EVEN'),
  effective_at timestamptz NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (workspace_id,id),
  FOREIGN KEY (workspace_id, currency_id) REFERENCES app.currencies(workspace_id, id) ,
  UNIQUE (workspace_id, currency_id, version)
);

CREATE TABLE app.brokers (
  workspace_id uuid NOT NULL REFERENCES app.workspaces(id),
  id uuid NOT NULL DEFAULT gen_random_uuid() CHECK (id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  actor_id text NOT NULL DEFAULT app.current_actor_id(),
  origin text NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual','import','broker','provider','calculated')),
  created_at timestamptz NOT NULL DEFAULT now(),
  name text NOT NULL,
  source_namespace text NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  archived_at timestamptz,
  PRIMARY KEY (workspace_id,id),
  UNIQUE (workspace_id, source_namespace)
);

CREATE TABLE app.accounts (
  workspace_id uuid NOT NULL REFERENCES app.workspaces(id),
  id uuid NOT NULL DEFAULT gen_random_uuid() CHECK (id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  actor_id text NOT NULL DEFAULT app.current_actor_id(),
  origin text NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual','import','broker','provider','calculated')),
  created_at timestamptz NOT NULL DEFAULT now(),
  broker_id uuid,
  name text NOT NULL,
  environment text NOT NULL CHECK (environment IN ('live','paper')),
  account_type text NOT NULL CHECK (account_type IN ('cash','margin','other')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed','historical')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  archived_at timestamptz,
  PRIMARY KEY (workspace_id,id),
  FOREIGN KEY (workspace_id, broker_id) REFERENCES app.brokers(workspace_id, id) 
);

CREATE TABLE app.account_settings_versions (
  workspace_id uuid NOT NULL REFERENCES app.workspaces(id),
  id uuid NOT NULL DEFAULT gen_random_uuid() CHECK (id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  actor_id text NOT NULL DEFAULT app.current_actor_id(),
  origin text NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual','import','broker','provider','calculated')),
  created_at timestamptz NOT NULL DEFAULT now(),
  account_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  base_currency_id uuid NOT NULL,
  inventory_method text NOT NULL CHECK (inventory_method IN ('fifo','average','specific')),
  allow_short boolean NOT NULL DEFAULT false,
  holding_mode text NOT NULL DEFAULT 'netted' CHECK (holding_mode IN ('netted','segregated')),
  effective_at timestamptz NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (workspace_id,id),
  FOREIGN KEY (workspace_id, account_id) REFERENCES app.accounts(workspace_id, id) ,
  FOREIGN KEY (workspace_id, base_currency_id) REFERENCES app.currencies(workspace_id, id) ,
  UNIQUE (workspace_id, account_id, version)
);

CREATE TABLE app.cash_buckets (
  workspace_id uuid NOT NULL REFERENCES app.workspaces(id),
  id uuid NOT NULL DEFAULT gen_random_uuid() CHECK (id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  actor_id text NOT NULL DEFAULT app.current_actor_id(),
  origin text NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual','import','broker','provider','calculated')),
  created_at timestamptz NOT NULL DEFAULT now(),
  account_id uuid NOT NULL,
  currency_id uuid NOT NULL,
  custody_key text NOT NULL DEFAULT 'default',
  category text NOT NULL CHECK (category IN ('settled','unsettled','restricted','collateral_cash')),
  archived_at timestamptz,
  PRIMARY KEY (workspace_id,id),
  FOREIGN KEY (workspace_id, account_id) REFERENCES app.accounts(workspace_id, id) ,
  FOREIGN KEY (workspace_id, currency_id) REFERENCES app.currencies(workspace_id, id) ,
  UNIQUE (workspace_id, account_id, currency_id, custody_key, category),
  UNIQUE (workspace_id, id, currency_id),
  UNIQUE (workspace_id, id, account_id, currency_id)
);

CREATE TABLE app.instruments (
  workspace_id uuid NOT NULL REFERENCES app.workspaces(id),
  id uuid NOT NULL DEFAULT gen_random_uuid() CHECK (id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  actor_id text NOT NULL DEFAULT app.current_actor_id(),
  origin text NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual','import','broker','provider','calculated')),
  created_at timestamptz NOT NULL DEFAULT now(),
  name text NOT NULL,
  family text NOT NULL,
  subtype text NOT NULL,
  economic_identity text NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  archived_at timestamptz,
  PRIMARY KEY (workspace_id,id),
  UNIQUE (workspace_id, economic_identity)
);

CREATE TABLE app.instrument_versions (
  workspace_id uuid NOT NULL REFERENCES app.workspaces(id),
  id uuid NOT NULL DEFAULT gen_random_uuid() CHECK (id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  actor_id text NOT NULL DEFAULT app.current_actor_id(),
  origin text NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual','import','broker','provider','calculated')),
  created_at timestamptz NOT NULL DEFAULT now(),
  instrument_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  quantity_unit text NOT NULL,
  quote_currency_id uuid,
  settlement_currency_id uuid,
  multiplier_raw text, multiplier numeric(78,36) GENERATED ALWAYS AS (app.financial_decimal(multiplier_raw)) STORED CHECK (multiplier > 0),
  quantity_increment_raw text, quantity_increment numeric(78,36) GENERATED ALWAYS AS (app.financial_decimal(quantity_increment_raw)) STORED CHECK (quantity_increment > 0),
  price_increment_raw text, price_increment numeric(78,36) GENERATED ALWAYS AS (app.financial_decimal(price_increment_raw)) STORED CHECK (price_increment > 0),
  capability text NOT NULL CHECK (capability IN ('native-linear','manual')),
  CONSTRAINT instrument_versions_native_metadata_known CHECK (capability <> 'native-linear' OR num_nonnulls(quote_currency_id,settlement_currency_id,multiplier_raw,quantity_increment_raw,price_increment_raw)=5),
  payload jsonb NOT NULL DEFAULT '{}',
  effective_at timestamptz NOT NULL,
  PRIMARY KEY (workspace_id,id),
  FOREIGN KEY (workspace_id, instrument_id) REFERENCES app.instruments(workspace_id, id) ,
  FOREIGN KEY (workspace_id, quote_currency_id) REFERENCES app.currencies(workspace_id, id) ,
  FOREIGN KEY (workspace_id, settlement_currency_id) REFERENCES app.currencies(workspace_id, id) ,
  UNIQUE (workspace_id, instrument_id, version),
  UNIQUE (workspace_id, id, instrument_id)
);

CREATE TABLE app.trades (
  workspace_id uuid NOT NULL REFERENCES app.workspaces(id),
  id uuid NOT NULL DEFAULT gen_random_uuid() CHECK (id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  actor_id text NOT NULL DEFAULT app.current_actor_id(),
  origin text NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual','import','broker','provider','calculated')),
  created_at timestamptz NOT NULL DEFAULT now(),
  title text NOT NULL,
  classification text NOT NULL CHECK (classification IN ('active-trading','investing')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','planned','open','partially_closed','pending_completion','closed','canceled')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  archived_at timestamptz,
  PRIMARY KEY (workspace_id,id)
);

CREATE TABLE app.trade_legs (
  workspace_id uuid NOT NULL REFERENCES app.workspaces(id),
  id uuid NOT NULL DEFAULT gen_random_uuid() CHECK (id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  actor_id text NOT NULL DEFAULT app.current_actor_id(),
  origin text NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual','import','broker','provider','calculated')),
  created_at timestamptz NOT NULL DEFAULT now(),
  trade_id uuid NOT NULL,
  account_id uuid NOT NULL,
  instrument_version_id uuid NOT NULL,
  direction text NOT NULL CHECK (direction IN ('long','short','neutral')),
  label text NOT NULL DEFAULT '',
  PRIMARY KEY (workspace_id,id),
  FOREIGN KEY (workspace_id, trade_id) REFERENCES app.trades(workspace_id, id) ,
  FOREIGN KEY (workspace_id, account_id) REFERENCES app.accounts(workspace_id, id) ,
  FOREIGN KEY (workspace_id, instrument_version_id) REFERENCES app.instrument_versions(workspace_id, id) 
);

CREATE TABLE app.orders (
  workspace_id uuid NOT NULL REFERENCES app.workspaces(id),
  id uuid NOT NULL DEFAULT gen_random_uuid() CHECK (id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  actor_id text NOT NULL DEFAULT app.current_actor_id(),
  origin text NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual','import','broker','provider','calculated')),
  created_at timestamptz NOT NULL DEFAULT now(),
  account_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('single','package')),
  source_namespace text,
  source_id text,
  PRIMARY KEY (workspace_id,id),
  FOREIGN KEY (workspace_id, account_id) REFERENCES app.accounts(workspace_id, id) ,
  UNIQUE (workspace_id, account_id, source_namespace, source_id),
  CHECK ((source_namespace IS NULL) = (source_id IS NULL))
);

CREATE TABLE app.order_legs (
  workspace_id uuid NOT NULL REFERENCES app.workspaces(id),
  id uuid NOT NULL DEFAULT gen_random_uuid() CHECK (id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  actor_id text NOT NULL DEFAULT app.current_actor_id(),
  origin text NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual','import','broker','provider','calculated')),
  created_at timestamptz NOT NULL DEFAULT now(),
  order_id uuid NOT NULL,
  instrument_version_id uuid NOT NULL,
  side text NOT NULL CHECK (side IN ('buy','sell')),
  ratio_raw text NOT NULL, ratio numeric(78,36) GENERATED ALWAYS AS (app.financial_decimal(ratio_raw)) STORED CHECK (ratio > 0),
  PRIMARY KEY (workspace_id,id),
  FOREIGN KEY (workspace_id, order_id) REFERENCES app.orders(workspace_id, id) ,
  FOREIGN KEY (workspace_id, instrument_version_id) REFERENCES app.instrument_versions(workspace_id, id) 
);

CREATE TABLE app.order_revisions (
  workspace_id uuid NOT NULL REFERENCES app.workspaces(id),
  id uuid NOT NULL DEFAULT gen_random_uuid() CHECK (id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  actor_id text NOT NULL DEFAULT app.current_actor_id(),
  origin text NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual','import','broker','provider','calculated')),
  created_at timestamptz NOT NULL DEFAULT now(),
  order_id uuid NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  status text NOT NULL CHECK (status IN ('recorded','pending','working','partially_filled','filled','canceled','rejected','expired')),
  payload jsonb NOT NULL,
  economic_at timestamptz NOT NULL,
  PRIMARY KEY (workspace_id,id),
  FOREIGN KEY (workspace_id, order_id) REFERENCES app.orders(workspace_id, id) ,
  UNIQUE (workspace_id, order_id, revision)
);

CREATE TABLE app.financial_commands (
  workspace_id uuid NOT NULL REFERENCES app.workspaces(id),
  id uuid NOT NULL DEFAULT gen_random_uuid() CHECK (id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  actor_id text NOT NULL DEFAULT app.current_actor_id(),
  origin text NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual','import','broker','provider','calculated')),
  created_at timestamptz NOT NULL DEFAULT now(),
  audit_event_id uuid NOT NULL,
  request_id text,
  FOREIGN KEY (workspace_id,audit_event_id) REFERENCES app.audit_events(workspace_id,id) DEFERRABLE INITIALLY DEFERRED,
  idempotency_key text NOT NULL CHECK (char_length(idempotency_key) BETWEEN 1 AND 200),
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  kind text NOT NULL,
  result jsonb NOT NULL,
  source_revision integer NOT NULL CHECK (source_revision > 0),
  PRIMARY KEY (workspace_id,id),
  UNIQUE (workspace_id, idempotency_key),
  UNIQUE (workspace_id, source_revision)
);

CREATE TABLE app.executions (
  workspace_id uuid NOT NULL REFERENCES app.workspaces(id),
  id uuid NOT NULL DEFAULT gen_random_uuid() CHECK (id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  actor_id text NOT NULL DEFAULT app.current_actor_id(),
  origin text NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual','import','broker','provider','calculated')),
  created_at timestamptz NOT NULL DEFAULT now(),
  command_id uuid NOT NULL,
  source_revision integer NOT NULL CHECK (source_revision > 0),
  account_id uuid NOT NULL,
  instrument_version_id uuid NOT NULL,
  order_leg_id uuid,
  side text NOT NULL CHECK (side IN ('buy','sell')),
  quantity_raw text NOT NULL, quantity numeric(78,36) GENERATED ALWAYS AS (app.financial_decimal(quantity_raw)) STORED CHECK (quantity > 0),
  price_raw text, price numeric(78,36) GENERATED ALWAYS AS (app.financial_decimal(price_raw)) STORED CHECK (price >= 0),
  principal_raw text, principal numeric(78,36) GENERATED ALWAYS AS (app.financial_decimal(principal_raw)) STORED CHECK (principal >= 0),
  principal_currency_id uuid,
  economic_at timestamptz NOT NULL,
  ordering_key text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  supersedes_id uuid,
  source_namespace text,
  source_id text,
  PRIMARY KEY (workspace_id,id),
  FOREIGN KEY (workspace_id, command_id) REFERENCES app.financial_commands(workspace_id, id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (workspace_id, account_id) REFERENCES app.accounts(workspace_id, id) ,
  FOREIGN KEY (workspace_id, instrument_version_id) REFERENCES app.instrument_versions(workspace_id, id) ,
  FOREIGN KEY (workspace_id, order_leg_id) REFERENCES app.order_legs(workspace_id, id) ,
  FOREIGN KEY (workspace_id, principal_currency_id) REFERENCES app.currencies(workspace_id, id) ,
  FOREIGN KEY (workspace_id, supersedes_id) REFERENCES app.executions(workspace_id, id) ,
  CHECK ((principal_raw IS NULL) = (principal_currency_id IS NULL)),
  CHECK ((source_namespace IS NULL) = (source_id IS NULL)),
  UNIQUE (workspace_id, account_id, source_namespace, source_id)
);

CREATE TABLE app.opening_lots (
  workspace_id uuid NOT NULL REFERENCES app.workspaces(id),
  id uuid NOT NULL DEFAULT gen_random_uuid() CHECK (id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  actor_id text NOT NULL DEFAULT app.current_actor_id(),
  origin text NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual','import','broker','provider','calculated')),
  created_at timestamptz NOT NULL DEFAULT now(),
  command_id uuid NOT NULL,
  source_revision integer NOT NULL CHECK (source_revision > 0),
  account_id uuid NOT NULL,
  instrument_version_id uuid NOT NULL,
  quantity_raw text NOT NULL, quantity numeric(78,36) GENERATED ALWAYS AS (app.financial_decimal(quantity_raw)) STORED CHECK (quantity > 0),
  direction text NOT NULL CHECK (direction IN ('long','short')),
  price_raw text, price numeric(78,36) GENERATED ALWAYS AS (app.financial_decimal(price_raw)) STORED CHECK (price >= 0),
  principal_raw text, principal numeric(78,36) GENERATED ALWAYS AS (app.financial_decimal(principal_raw)) STORED CHECK (principal >= 0),
  economic_at timestamptz NOT NULL,
  ordering_key text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (workspace_id,id),
  FOREIGN KEY (workspace_id, command_id) REFERENCES app.financial_commands(workspace_id, id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (workspace_id, account_id) REFERENCES app.accounts(workspace_id, id) ,
  FOREIGN KEY (workspace_id, instrument_version_id) REFERENCES app.instrument_versions(workspace_id, id) 
);

CREATE TABLE app.fees (
  workspace_id uuid NOT NULL REFERENCES app.workspaces(id),
  id uuid NOT NULL DEFAULT gen_random_uuid() CHECK (id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  actor_id text NOT NULL DEFAULT app.current_actor_id(),
  origin text NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual','import','broker','provider','calculated')),
  created_at timestamptz NOT NULL DEFAULT now(),
  command_id uuid NOT NULL,
  source_revision integer NOT NULL CHECK (source_revision > 0),
  account_id uuid NOT NULL,
  execution_id uuid,
  currency_id uuid NOT NULL,
  amount_raw text NOT NULL, amount numeric(78,36) GENERATED ALWAYS AS (app.financial_decimal(amount_raw)) STORED,
  kind text NOT NULL,
  economic_at timestamptz NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (workspace_id,id),
  FOREIGN KEY (workspace_id, command_id) REFERENCES app.financial_commands(workspace_id, id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (workspace_id, account_id) REFERENCES app.accounts(workspace_id, id) ,
  FOREIGN KEY (workspace_id, execution_id) REFERENCES app.executions(workspace_id, id) ,
  FOREIGN KEY (workspace_id, currency_id) REFERENCES app.currencies(workspace_id, id) 
);

CREATE TABLE app.cash_movements (
  workspace_id uuid NOT NULL REFERENCES app.workspaces(id),
  id uuid NOT NULL DEFAULT gen_random_uuid() CHECK (id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  actor_id text NOT NULL DEFAULT app.current_actor_id(),
  origin text NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual','import','broker','provider','calculated')),
  created_at timestamptz NOT NULL DEFAULT now(),
  command_id uuid NOT NULL,
  source_revision integer NOT NULL CHECK (source_revision > 0),
  account_id uuid NOT NULL,
  cash_bucket_id uuid NOT NULL,
  currency_id uuid NOT NULL,
  amount_raw text NOT NULL, amount numeric(78,36) GENERATED ALWAYS AS (app.financial_decimal(amount_raw)) STORED,
  kind text NOT NULL,
  economic_at timestamptz NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (workspace_id,id),
  FOREIGN KEY (workspace_id, command_id) REFERENCES app.financial_commands(workspace_id, id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (workspace_id,cash_bucket_id,account_id,currency_id) REFERENCES app.cash_buckets(workspace_id,id,account_id,currency_id)
);

CREATE TABLE app.fx_conversions (
  workspace_id uuid NOT NULL REFERENCES app.workspaces(id),
  id uuid NOT NULL DEFAULT gen_random_uuid() CHECK (id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  actor_id text NOT NULL DEFAULT app.current_actor_id(),
  origin text NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual','import','broker','provider','calculated')),
  created_at timestamptz NOT NULL DEFAULT now(),
  command_id uuid NOT NULL,
  source_revision integer NOT NULL CHECK (source_revision > 0),
  source_bucket_id uuid NOT NULL,
  destination_bucket_id uuid NOT NULL,
  source_amount_raw text NOT NULL, source_amount numeric(78,36) GENERATED ALWAYS AS (app.financial_decimal(source_amount_raw)) STORED CHECK (source_amount > 0),
  destination_amount_raw text NOT NULL, destination_amount numeric(78,36) GENERATED ALWAYS AS (app.financial_decimal(destination_amount_raw)) STORED CHECK (destination_amount > 0),
  rate_raw text, rate numeric(78,36) GENERATED ALWAYS AS (app.financial_decimal(rate_raw)) STORED CHECK (rate > 0),
  economic_at timestamptz NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (workspace_id,id),
  FOREIGN KEY (workspace_id, command_id) REFERENCES app.financial_commands(workspace_id, id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (workspace_id, source_bucket_id) REFERENCES app.cash_buckets(workspace_id, id) ,
  FOREIGN KEY (workspace_id, destination_bucket_id) REFERENCES app.cash_buckets(workspace_id, id) ,
  CHECK (source_bucket_id <> destination_bucket_id)
);

CREATE TABLE app.ledger_events (
  workspace_id uuid NOT NULL REFERENCES app.workspaces(id),
  id uuid NOT NULL DEFAULT gen_random_uuid() CHECK (id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  actor_id text NOT NULL DEFAULT app.current_actor_id(),
  origin text NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual','import','broker','provider','calculated')),
  created_at timestamptz NOT NULL DEFAULT now(),
  command_id uuid NOT NULL,
  source_revision integer NOT NULL CHECK (source_revision > 0),
  effect_key text NOT NULL,
  currency_id uuid NOT NULL,
  kind text NOT NULL,
  economic_at timestamptz NOT NULL,
  reversal_of_id uuid,
  execution_id uuid,
  fee_id uuid,
  cash_movement_id uuid,
  fx_conversion_id uuid,
  payload jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (workspace_id,id),
  FOREIGN KEY (workspace_id, command_id) REFERENCES app.financial_commands(workspace_id, id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (workspace_id, currency_id) REFERENCES app.currencies(workspace_id, id) ,
  FOREIGN KEY (workspace_id, reversal_of_id) REFERENCES app.ledger_events(workspace_id, id) ,
  CHECK (num_nonnulls(execution_id,fee_id,cash_movement_id,fx_conversion_id,reversal_of_id) <= 1),
  CONSTRAINT ledger_events_execution_effect_kind CHECK (execution_id IS NULL OR kind IN ('execution-principal','manual-settlement','settlement')),
  FOREIGN KEY (workspace_id,execution_id) REFERENCES app.executions(workspace_id,id),
  FOREIGN KEY (workspace_id,fee_id) REFERENCES app.fees(workspace_id,id),
  FOREIGN KEY (workspace_id,cash_movement_id) REFERENCES app.cash_movements(workspace_id,id),
  FOREIGN KEY (workspace_id,fx_conversion_id) REFERENCES app.fx_conversions(workspace_id,id),
  UNIQUE (workspace_id,fee_id),
  UNIQUE (workspace_id,cash_movement_id),
  UNIQUE (workspace_id, effect_key),
  UNIQUE (workspace_id, reversal_of_id),
  UNIQUE (workspace_id, id, currency_id)
);

CREATE TABLE app.postings (
  workspace_id uuid NOT NULL REFERENCES app.workspaces(id),
  id uuid NOT NULL DEFAULT gen_random_uuid() CHECK (id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  actor_id text NOT NULL DEFAULT app.current_actor_id(),
  origin text NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual','import','broker','provider','calculated')),
  created_at timestamptz NOT NULL DEFAULT now(),
  ledger_event_id uuid NOT NULL,
  currency_id uuid NOT NULL,
  cash_bucket_id uuid,
  control_key text,
  amount_raw text NOT NULL, amount numeric(78,36) GENERATED ALWAYS AS (app.financial_decimal(amount_raw)) STORED,
  PRIMARY KEY (workspace_id,id),
  FOREIGN KEY (workspace_id,ledger_event_id,currency_id) REFERENCES app.ledger_events(workspace_id,id,currency_id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (workspace_id,cash_bucket_id,currency_id) REFERENCES app.cash_buckets(workspace_id,id,currency_id),
  CHECK ((cash_bucket_id IS NULL) <> (control_key IS NULL)),
  CHECK (control_key IS NULL OR char_length(btrim(control_key)) BETWEEN 1 AND 120)
);

CREATE TABLE app.holding_books (
  workspace_id uuid NOT NULL REFERENCES app.workspaces(id),
  id uuid NOT NULL DEFAULT gen_random_uuid() CHECK (id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  actor_id text NOT NULL DEFAULT app.current_actor_id(),
  origin text NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual','import','broker','provider','calculated')),
  created_at timestamptz NOT NULL DEFAULT now(),
  account_id uuid NOT NULL,
  instrument_id uuid NOT NULL,
  instrument_version_id uuid NOT NULL,
  inventory_method text NOT NULL CHECK (inventory_method IN ('fifo','average','specific')),
  source_revision integer NOT NULL CHECK (source_revision >= 0),
  state jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (workspace_id,id),
  FOREIGN KEY (workspace_id, account_id) REFERENCES app.accounts(workspace_id, id) ,
  FOREIGN KEY (workspace_id, instrument_id) REFERENCES app.instruments(workspace_id, id) ,
  FOREIGN KEY (workspace_id,instrument_version_id,instrument_id) REFERENCES app.instrument_versions(workspace_id,id,instrument_id),
  UNIQUE (workspace_id, account_id, instrument_id)
);

CREATE TABLE app.positions (
  workspace_id uuid NOT NULL REFERENCES app.workspaces(id),
  id uuid NOT NULL DEFAULT gen_random_uuid() CHECK (id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  actor_id text NOT NULL DEFAULT app.current_actor_id(),
  origin text NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual','import','broker','provider','calculated')),
  created_at timestamptz NOT NULL DEFAULT now(),
  holding_book_id uuid NOT NULL,
  quantity_raw text, quantity numeric(78,36) GENERATED ALWAYS AS (app.financial_decimal(quantity_raw)) STORED,
  basis_raw text, basis numeric(78,36) GENERATED ALWAYS AS (app.financial_decimal(basis_raw)) STORED,
  source_revision integer NOT NULL CHECK (source_revision > 0),
  state jsonb NOT NULL,
  PRIMARY KEY (workspace_id,id),
  FOREIGN KEY (workspace_id, holding_book_id) REFERENCES app.holding_books(workspace_id, id) ,
  UNIQUE (workspace_id, holding_book_id)
);

CREATE TABLE app.lots (
  workspace_id uuid NOT NULL REFERENCES app.workspaces(id),
  id uuid NOT NULL DEFAULT gen_random_uuid() CHECK (id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  actor_id text NOT NULL DEFAULT app.current_actor_id(),
  origin text NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual','import','broker','provider','calculated')),
  created_at timestamptz NOT NULL DEFAULT now(),
  holding_book_id uuid NOT NULL,
  execution_id uuid,
  holding_transfer_id uuid,
  direction text NOT NULL CHECK (direction IN ('long','short')),
  opening_lot_id uuid,
  remaining_quantity_raw text NOT NULL, remaining_quantity numeric(78,36) GENERATED ALWAYS AS (app.financial_decimal(remaining_quantity_raw)) STORED CHECK (remaining_quantity >= 0),
  source_revision integer NOT NULL CHECK (source_revision > 0),
  state jsonb NOT NULL,
  PRIMARY KEY (workspace_id,id),
  FOREIGN KEY (workspace_id, holding_book_id) REFERENCES app.holding_books(workspace_id, id) ,
  FOREIGN KEY (workspace_id, execution_id) REFERENCES app.executions(workspace_id, id) ,
  FOREIGN KEY (workspace_id, opening_lot_id) REFERENCES app.opening_lots(workspace_id, id) ,
  CHECK (num_nonnulls(execution_id,opening_lot_id) <= 1 AND num_nonnulls(execution_id,opening_lot_id,holding_transfer_id) >= 1)
);

CREATE TABLE app.lot_matches (
  workspace_id uuid NOT NULL REFERENCES app.workspaces(id),
  id uuid NOT NULL DEFAULT gen_random_uuid() CHECK (id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  actor_id text NOT NULL DEFAULT app.current_actor_id(),
  origin text NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual','import','broker','provider','calculated')),
  created_at timestamptz NOT NULL DEFAULT now(),
  holding_book_id uuid NOT NULL,
  opening_lot_id uuid,
  closing_execution_id uuid NOT NULL,
  quantity_raw text NOT NULL, quantity numeric(78,36) GENERATED ALWAYS AS (app.financial_decimal(quantity_raw)) STORED CHECK (quantity > 0),
  source_revision integer NOT NULL CHECK (source_revision > 0),
  payload jsonb NOT NULL,
  PRIMARY KEY (workspace_id,id),
  FOREIGN KEY (workspace_id, holding_book_id) REFERENCES app.holding_books(workspace_id, id) ,
  FOREIGN KEY (workspace_id, opening_lot_id) REFERENCES app.lots(workspace_id, id) ,
  FOREIGN KEY (workspace_id, closing_execution_id) REFERENCES app.executions(workspace_id, id) 
);

CREATE TABLE app.allocation_sets (
  workspace_id uuid NOT NULL REFERENCES app.workspaces(id),
  id uuid NOT NULL DEFAULT gen_random_uuid() CHECK (id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  actor_id text NOT NULL DEFAULT app.current_actor_id(),
  origin text NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual','import','broker','provider','calculated')),
  created_at timestamptz NOT NULL DEFAULT now(),
  command_id uuid NOT NULL,
  source_revision integer NOT NULL CHECK (source_revision > 0),
  execution_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  reason text NOT NULL,
  PRIMARY KEY (workspace_id,id),
  FOREIGN KEY (workspace_id, command_id) REFERENCES app.financial_commands(workspace_id, id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (workspace_id, execution_id) REFERENCES app.executions(workspace_id, id) ,
  UNIQUE (workspace_id, execution_id, version)
);

CREATE TABLE app.allocation_items (
  workspace_id uuid NOT NULL REFERENCES app.workspaces(id),
  id uuid NOT NULL DEFAULT gen_random_uuid() CHECK (id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  actor_id text NOT NULL DEFAULT app.current_actor_id(),
  origin text NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual','import','broker','provider','calculated')),
  created_at timestamptz NOT NULL DEFAULT now(),
  allocation_set_id uuid NOT NULL,
  trade_leg_id uuid,
  quantity_raw text NOT NULL, quantity numeric(78,36) GENERATED ALWAYS AS (app.financial_decimal(quantity_raw)) STORED CHECK (quantity >= 0),
  payload jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (workspace_id,id),
  FOREIGN KEY (workspace_id, allocation_set_id) REFERENCES app.allocation_sets(workspace_id, id) ,
  FOREIGN KEY (workspace_id, trade_leg_id) REFERENCES app.trade_legs(workspace_id, id) 
);

CREATE TABLE app.cost_attribution_sets (
  workspace_id uuid NOT NULL REFERENCES app.workspaces(id),
  id uuid NOT NULL DEFAULT gen_random_uuid() CHECK (id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  actor_id text NOT NULL DEFAULT app.current_actor_id(),
  origin text NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual','import','broker','provider','calculated')),
  created_at timestamptz NOT NULL DEFAULT now(),
  command_id uuid NOT NULL,
  source_revision integer NOT NULL CHECK (source_revision > 0),
  fee_id uuid NOT NULL,
  axis text NOT NULL CHECK (axis IN ('campaign','inventory')),
  version integer NOT NULL CHECK (version > 0),
  reason text NOT NULL,
  PRIMARY KEY (workspace_id,id),
  FOREIGN KEY (workspace_id, command_id) REFERENCES app.financial_commands(workspace_id, id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (workspace_id, fee_id) REFERENCES app.fees(workspace_id, id) ,
  UNIQUE (workspace_id, fee_id, axis, version)
);

CREATE TABLE app.cost_allocations (
  workspace_id uuid NOT NULL REFERENCES app.workspaces(id),
  id uuid NOT NULL DEFAULT gen_random_uuid() CHECK (id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  actor_id text NOT NULL DEFAULT app.current_actor_id(),
  origin text NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual','import','broker','provider','calculated')),
  created_at timestamptz NOT NULL DEFAULT now(),
  attribution_set_id uuid NOT NULL,
  trade_leg_id uuid,
  lot_id uuid,
  currency_id uuid NOT NULL,
  amount_raw text NOT NULL, amount numeric(78,36) GENERATED ALWAYS AS (app.financial_decimal(amount_raw)) STORED,
  payload jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (workspace_id,id),
  FOREIGN KEY (workspace_id, attribution_set_id) REFERENCES app.cost_attribution_sets(workspace_id, id) ,
  FOREIGN KEY (workspace_id, trade_leg_id) REFERENCES app.trade_legs(workspace_id, id) ,
  FOREIGN KEY (workspace_id, lot_id) REFERENCES app.lots(workspace_id, id) ,
  FOREIGN KEY (workspace_id, currency_id) REFERENCES app.currencies(workspace_id, id) ,
  CHECK (trade_leg_id IS NULL OR lot_id IS NULL)
);

CREATE TABLE app.execution_supersessions (
  workspace_id uuid NOT NULL REFERENCES app.workspaces(id),
  id uuid NOT NULL DEFAULT gen_random_uuid() CHECK (id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  actor_id text NOT NULL DEFAULT app.current_actor_id(),
  origin text NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual','import','broker','provider','calculated')),
  created_at timestamptz NOT NULL DEFAULT now(),
  command_id uuid NOT NULL,
  source_revision integer NOT NULL CHECK (source_revision > 0),
  original_execution_id uuid NOT NULL,
  replacement_execution_id uuid NOT NULL,
  reason text NOT NULL,
  PRIMARY KEY (workspace_id,id),
  FOREIGN KEY (workspace_id, command_id) REFERENCES app.financial_commands(workspace_id, id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (workspace_id, original_execution_id) REFERENCES app.executions(workspace_id, id) ,
  FOREIGN KEY (workspace_id, replacement_execution_id) REFERENCES app.executions(workspace_id, id) ,
  UNIQUE (workspace_id, original_execution_id),
  UNIQUE (workspace_id, replacement_execution_id),
  CHECK (original_execution_id <> replacement_execution_id)
);

CREATE TABLE app.fx_observations (
  workspace_id uuid NOT NULL REFERENCES app.workspaces(id),
  id uuid NOT NULL DEFAULT gen_random_uuid() CHECK (id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  actor_id text NOT NULL DEFAULT app.current_actor_id(),
  origin text NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual','import','broker','provider','calculated')),
  created_at timestamptz NOT NULL DEFAULT now(),
  base_currency_id uuid NOT NULL,
  quote_currency_id uuid NOT NULL,
  rate_raw text NOT NULL, rate numeric(78,36) GENERATED ALWAYS AS (app.financial_decimal(rate_raw)) STORED CHECK (rate > 0),
  observed_at timestamptz NOT NULL,
  source text NOT NULL,
  supersedes_id uuid,
  payload jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (workspace_id,id),
  FOREIGN KEY (workspace_id, base_currency_id) REFERENCES app.currencies(workspace_id, id) ,
  FOREIGN KEY (workspace_id, quote_currency_id) REFERENCES app.currencies(workspace_id, id) ,
  FOREIGN KEY (workspace_id, supersedes_id) REFERENCES app.fx_observations(workspace_id, id) ,
  CHECK (base_currency_id <> quote_currency_id)
);

CREATE TABLE app.price_observations (
  workspace_id uuid NOT NULL REFERENCES app.workspaces(id),
  id uuid NOT NULL DEFAULT gen_random_uuid() CHECK (id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  actor_id text NOT NULL DEFAULT app.current_actor_id(),
  origin text NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual','import','broker','provider','calculated')),
  created_at timestamptz NOT NULL DEFAULT now(),
  instrument_version_id uuid NOT NULL,
  currency_id uuid NOT NULL,
  price_raw text NOT NULL, price numeric(78,36) GENERATED ALWAYS AS (app.financial_decimal(price_raw)) STORED CHECK (price >= 0),
  observed_at timestamptz NOT NULL,
  source text NOT NULL,
  supersedes_id uuid,
  payload jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (workspace_id,id),
  FOREIGN KEY (workspace_id, instrument_version_id) REFERENCES app.instrument_versions(workspace_id, id) ,
  FOREIGN KEY (workspace_id, currency_id) REFERENCES app.currencies(workspace_id, id) ,
  FOREIGN KEY (workspace_id, supersedes_id) REFERENCES app.price_observations(workspace_id, id) 
);

CREATE TABLE app.outbox_events (
  workspace_id uuid NOT NULL REFERENCES app.workspaces(id),
  id uuid NOT NULL DEFAULT gen_random_uuid() CHECK (id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  actor_id text NOT NULL DEFAULT app.current_actor_id(),
  origin text NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual','import','broker','provider','calculated')),
  created_at timestamptz NOT NULL DEFAULT now(),
  command_id uuid NOT NULL,
  source_revision integer NOT NULL CHECK (source_revision > 0),
  event_kind text NOT NULL,
  payload jsonb NOT NULL,
  PRIMARY KEY (workspace_id,id),
  FOREIGN KEY (workspace_id, command_id) REFERENCES app.financial_commands(workspace_id, id) DEFERRABLE INITIALLY DEFERRED
);

--> statement-breakpoint
ALTER TABLE app.financial_state OWNER TO journal_migrator;
ALTER TABLE app.financial_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.financial_state FORCE ROW LEVEL SECURITY;
CREATE POLICY financial_state_read ON app.financial_state FOR SELECT TO journal_app
USING (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IS NOT NULL);
CREATE POLICY financial_state_insert ON app.financial_state FOR INSERT TO journal_app
WITH CHECK (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IN ('owner','editor'));
REVOKE ALL ON app.financial_state FROM PUBLIC;
GRANT SELECT, INSERT ON app.financial_state TO journal_app;
CREATE POLICY financial_state_update ON app.financial_state FOR UPDATE TO journal_app
USING (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IN ('owner','editor'))
WITH CHECK (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IN ('owner','editor'));
GRANT UPDATE (revision) ON app.financial_state TO journal_app;
ALTER TABLE app.currencies OWNER TO journal_migrator;
ALTER TABLE app.currencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.currencies FORCE ROW LEVEL SECURITY;
CREATE POLICY currencies_read ON app.currencies FOR SELECT TO journal_app
USING (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IS NOT NULL);
CREATE POLICY currencies_insert ON app.currencies FOR INSERT TO journal_app
WITH CHECK (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IN ('owner','editor'));
REVOKE ALL ON app.currencies FROM PUBLIC;
GRANT SELECT, INSERT ON app.currencies TO journal_app;
CREATE POLICY currencies_update ON app.currencies FOR UPDATE TO journal_app
USING (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IN ('owner','editor'))
WITH CHECK (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IN ('owner','editor'));
GRANT UPDATE (name, archived_at, revision) ON app.currencies TO journal_app;
ALTER TABLE app.currency_convention_versions OWNER TO journal_migrator;
ALTER TABLE app.currency_convention_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.currency_convention_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY currency_convention_versions_read ON app.currency_convention_versions FOR SELECT TO journal_app
USING (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IS NOT NULL);
CREATE POLICY currency_convention_versions_insert ON app.currency_convention_versions FOR INSERT TO journal_app
WITH CHECK (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IN ('owner','editor'));
REVOKE ALL ON app.currency_convention_versions FROM PUBLIC;
GRANT SELECT, INSERT ON app.currency_convention_versions TO journal_app;
ALTER TABLE app.brokers OWNER TO journal_migrator;
ALTER TABLE app.brokers ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.brokers FORCE ROW LEVEL SECURITY;
CREATE POLICY brokers_read ON app.brokers FOR SELECT TO journal_app
USING (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IS NOT NULL);
CREATE POLICY brokers_insert ON app.brokers FOR INSERT TO journal_app
WITH CHECK (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IN ('owner','editor'));
REVOKE ALL ON app.brokers FROM PUBLIC;
GRANT SELECT, INSERT ON app.brokers TO journal_app;
CREATE POLICY brokers_update ON app.brokers FOR UPDATE TO journal_app
USING (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IN ('owner','editor'))
WITH CHECK (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IN ('owner','editor'));
GRANT UPDATE (name, archived_at, revision) ON app.brokers TO journal_app;
ALTER TABLE app.accounts OWNER TO journal_migrator;
ALTER TABLE app.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.accounts FORCE ROW LEVEL SECURITY;
CREATE POLICY accounts_read ON app.accounts FOR SELECT TO journal_app
USING (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IS NOT NULL);
CREATE POLICY accounts_insert ON app.accounts FOR INSERT TO journal_app
WITH CHECK (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IN ('owner','editor'));
REVOKE ALL ON app.accounts FROM PUBLIC;
GRANT SELECT, INSERT ON app.accounts TO journal_app;
CREATE POLICY accounts_update ON app.accounts FOR UPDATE TO journal_app
USING (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IN ('owner','editor'))
WITH CHECK (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IN ('owner','editor'));
GRANT UPDATE (name, status, archived_at, revision) ON app.accounts TO journal_app;
ALTER TABLE app.account_settings_versions OWNER TO journal_migrator;
ALTER TABLE app.account_settings_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.account_settings_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY account_settings_versions_read ON app.account_settings_versions FOR SELECT TO journal_app
USING (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IS NOT NULL);
CREATE POLICY account_settings_versions_insert ON app.account_settings_versions FOR INSERT TO journal_app
WITH CHECK (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IN ('owner','editor'));
REVOKE ALL ON app.account_settings_versions FROM PUBLIC;
GRANT SELECT, INSERT ON app.account_settings_versions TO journal_app;
ALTER TABLE app.cash_buckets OWNER TO journal_migrator;
ALTER TABLE app.cash_buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.cash_buckets FORCE ROW LEVEL SECURITY;
CREATE POLICY cash_buckets_read ON app.cash_buckets FOR SELECT TO journal_app
USING (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IS NOT NULL);
CREATE POLICY cash_buckets_insert ON app.cash_buckets FOR INSERT TO journal_app
WITH CHECK (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IN ('owner','editor'));
REVOKE ALL ON app.cash_buckets FROM PUBLIC;
GRANT SELECT, INSERT ON app.cash_buckets TO journal_app;
CREATE POLICY cash_buckets_update ON app.cash_buckets FOR UPDATE TO journal_app
USING (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IN ('owner','editor'))
WITH CHECK (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IN ('owner','editor'));
GRANT UPDATE (archived_at) ON app.cash_buckets TO journal_app;
ALTER TABLE app.instruments OWNER TO journal_migrator;
ALTER TABLE app.instruments ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.instruments FORCE ROW LEVEL SECURITY;
CREATE POLICY instruments_read ON app.instruments FOR SELECT TO journal_app
USING (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IS NOT NULL);
CREATE POLICY instruments_insert ON app.instruments FOR INSERT TO journal_app
WITH CHECK (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IN ('owner','editor'));
REVOKE ALL ON app.instruments FROM PUBLIC;
GRANT SELECT, INSERT ON app.instruments TO journal_app;
CREATE POLICY instruments_update ON app.instruments FOR UPDATE TO journal_app
USING (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IN ('owner','editor'))
WITH CHECK (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IN ('owner','editor'));
GRANT UPDATE (name, archived_at, revision) ON app.instruments TO journal_app;
ALTER TABLE app.instrument_versions OWNER TO journal_migrator;
ALTER TABLE app.instrument_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.instrument_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY instrument_versions_read ON app.instrument_versions FOR SELECT TO journal_app
USING (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IS NOT NULL);
CREATE POLICY instrument_versions_insert ON app.instrument_versions FOR INSERT TO journal_app
WITH CHECK (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IN ('owner','editor'));
REVOKE ALL ON app.instrument_versions FROM PUBLIC;
GRANT SELECT, INSERT ON app.instrument_versions TO journal_app;
ALTER TABLE app.trades OWNER TO journal_migrator;
ALTER TABLE app.trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.trades FORCE ROW LEVEL SECURITY;
CREATE POLICY trades_read ON app.trades FOR SELECT TO journal_app
USING (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IS NOT NULL);
CREATE POLICY trades_insert ON app.trades FOR INSERT TO journal_app
WITH CHECK (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IN ('owner','editor'));
REVOKE ALL ON app.trades FROM PUBLIC;
GRANT SELECT, INSERT ON app.trades TO journal_app;
CREATE POLICY trades_update ON app.trades FOR UPDATE TO journal_app
USING (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IN ('owner','editor'))
WITH CHECK (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IN ('owner','editor'));
GRANT UPDATE (title, status, revision, archived_at) ON app.trades TO journal_app;
ALTER TABLE app.trade_legs OWNER TO journal_migrator;
ALTER TABLE app.trade_legs ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.trade_legs FORCE ROW LEVEL SECURITY;
CREATE POLICY trade_legs_read ON app.trade_legs FOR SELECT TO journal_app
USING (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IS NOT NULL);
CREATE POLICY trade_legs_insert ON app.trade_legs FOR INSERT TO journal_app
WITH CHECK (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IN ('owner','editor'));
REVOKE ALL ON app.trade_legs FROM PUBLIC;
GRANT SELECT, INSERT ON app.trade_legs TO journal_app;
ALTER TABLE app.orders OWNER TO journal_migrator;
ALTER TABLE app.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.orders FORCE ROW LEVEL SECURITY;
CREATE POLICY orders_read ON app.orders FOR SELECT TO journal_app
USING (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IS NOT NULL);
CREATE POLICY orders_insert ON app.orders FOR INSERT TO journal_app
WITH CHECK (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IN ('owner','editor'));
REVOKE ALL ON app.orders FROM PUBLIC;
GRANT SELECT, INSERT ON app.orders TO journal_app;
ALTER TABLE app.order_legs OWNER TO journal_migrator;
ALTER TABLE app.order_legs ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.order_legs FORCE ROW LEVEL SECURITY;
CREATE POLICY order_legs_read ON app.order_legs FOR SELECT TO journal_app
USING (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IS NOT NULL);
CREATE POLICY order_legs_insert ON app.order_legs FOR INSERT TO journal_app
WITH CHECK (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IN ('owner','editor'));
REVOKE ALL ON app.order_legs FROM PUBLIC;
GRANT SELECT, INSERT ON app.order_legs TO journal_app;
ALTER TABLE app.order_revisions OWNER TO journal_migrator;
ALTER TABLE app.order_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.order_revisions FORCE ROW LEVEL SECURITY;
CREATE POLICY order_revisions_read ON app.order_revisions FOR SELECT TO journal_app
USING (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IS NOT NULL);
CREATE POLICY order_revisions_insert ON app.order_revisions FOR INSERT TO journal_app
WITH CHECK (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IN ('owner','editor'));
REVOKE ALL ON app.order_revisions FROM PUBLIC;
GRANT SELECT, INSERT ON app.order_revisions TO journal_app;
ALTER TABLE app.financial_commands OWNER TO journal_migrator;
ALTER TABLE app.financial_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.financial_commands FORCE ROW LEVEL SECURITY;
CREATE POLICY financial_commands_read ON app.financial_commands FOR SELECT TO journal_app
USING (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IS NOT NULL);
CREATE POLICY financial_commands_insert ON app.financial_commands FOR INSERT TO journal_app
WITH CHECK (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IN ('owner','editor'));
REVOKE ALL ON app.financial_commands FROM PUBLIC;
GRANT SELECT, INSERT ON app.financial_commands TO journal_app;
ALTER TABLE app.executions OWNER TO journal_migrator;
ALTER TABLE app.executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.executions FORCE ROW LEVEL SECURITY;
CREATE POLICY executions_read ON app.executions FOR SELECT TO journal_app
USING (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IS NOT NULL);
CREATE POLICY executions_insert ON app.executions FOR INSERT TO journal_app
WITH CHECK (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IN ('owner','editor'));
REVOKE ALL ON app.executions FROM PUBLIC;
GRANT SELECT, INSERT ON app.executions TO journal_app;
ALTER TABLE app.opening_lots OWNER TO journal_migrator;
ALTER TABLE app.opening_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.opening_lots FORCE ROW LEVEL SECURITY;
CREATE POLICY opening_lots_read ON app.opening_lots FOR SELECT TO journal_app
USING (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IS NOT NULL);
CREATE POLICY opening_lots_insert ON app.opening_lots FOR INSERT TO journal_app
WITH CHECK (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IN ('owner','editor'));
REVOKE ALL ON app.opening_lots FROM PUBLIC;
GRANT SELECT, INSERT ON app.opening_lots TO journal_app;
ALTER TABLE app.fees OWNER TO journal_migrator;
ALTER TABLE app.fees ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.fees FORCE ROW LEVEL SECURITY;
CREATE POLICY fees_read ON app.fees FOR SELECT TO journal_app
USING (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IS NOT NULL);
CREATE POLICY fees_insert ON app.fees FOR INSERT TO journal_app
WITH CHECK (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IN ('owner','editor'));
REVOKE ALL ON app.fees FROM PUBLIC;
GRANT SELECT, INSERT ON app.fees TO journal_app;
ALTER TABLE app.cash_movements OWNER TO journal_migrator;
ALTER TABLE app.cash_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.cash_movements FORCE ROW LEVEL SECURITY;
CREATE POLICY cash_movements_read ON app.cash_movements FOR SELECT TO journal_app
USING (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IS NOT NULL);
CREATE POLICY cash_movements_insert ON app.cash_movements FOR INSERT TO journal_app
WITH CHECK (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IN ('owner','editor'));
REVOKE ALL ON app.cash_movements FROM PUBLIC;
GRANT SELECT, INSERT ON app.cash_movements TO journal_app;
ALTER TABLE app.fx_conversions OWNER TO journal_migrator;
ALTER TABLE app.fx_conversions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.fx_conversions FORCE ROW LEVEL SECURITY;
CREATE POLICY fx_conversions_read ON app.fx_conversions FOR SELECT TO journal_app
USING (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IS NOT NULL);
CREATE POLICY fx_conversions_insert ON app.fx_conversions FOR INSERT TO journal_app
WITH CHECK (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IN ('owner','editor'));
REVOKE ALL ON app.fx_conversions FROM PUBLIC;
GRANT SELECT, INSERT ON app.fx_conversions TO journal_app;
ALTER TABLE app.ledger_events OWNER TO journal_migrator;
ALTER TABLE app.ledger_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.ledger_events FORCE ROW LEVEL SECURITY;
CREATE POLICY ledger_events_read ON app.ledger_events FOR SELECT TO journal_app
USING (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IS NOT NULL);
CREATE POLICY ledger_events_insert ON app.ledger_events FOR INSERT TO journal_app
WITH CHECK (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IN ('owner','editor'));
REVOKE ALL ON app.ledger_events FROM PUBLIC;
GRANT SELECT, INSERT ON app.ledger_events TO journal_app;
ALTER TABLE app.postings OWNER TO journal_migrator;
ALTER TABLE app.postings ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.postings FORCE ROW LEVEL SECURITY;
CREATE POLICY postings_read ON app.postings FOR SELECT TO journal_app
USING (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IS NOT NULL);
CREATE POLICY postings_insert ON app.postings FOR INSERT TO journal_app
WITH CHECK (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IN ('owner','editor'));
REVOKE ALL ON app.postings FROM PUBLIC;
GRANT SELECT, INSERT ON app.postings TO journal_app;
ALTER TABLE app.holding_books OWNER TO journal_migrator;
ALTER TABLE app.holding_books ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.holding_books FORCE ROW LEVEL SECURITY;
CREATE POLICY holding_books_read ON app.holding_books FOR SELECT TO journal_app
USING (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IS NOT NULL);
CREATE POLICY holding_books_insert ON app.holding_books FOR INSERT TO journal_app
WITH CHECK (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IN ('owner','editor'));
REVOKE ALL ON app.holding_books FROM PUBLIC;
GRANT SELECT, INSERT ON app.holding_books TO journal_app;
CREATE POLICY holding_books_update ON app.holding_books FOR UPDATE TO journal_app
USING (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IN ('owner','editor'))
WITH CHECK (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IN ('owner','editor'));
GRANT UPDATE (instrument_version_id, inventory_method, source_revision, state) ON app.holding_books TO journal_app;
ALTER TABLE app.positions OWNER TO journal_migrator;
ALTER TABLE app.positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.positions FORCE ROW LEVEL SECURITY;
CREATE POLICY positions_read ON app.positions FOR SELECT TO journal_app
USING (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IS NOT NULL);
CREATE POLICY positions_insert ON app.positions FOR INSERT TO journal_app
WITH CHECK (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IN ('owner','editor'));
REVOKE ALL ON app.positions FROM PUBLIC;
GRANT SELECT, INSERT ON app.positions TO journal_app;
CREATE POLICY positions_update ON app.positions FOR UPDATE TO journal_app
USING (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IN ('owner','editor'))
WITH CHECK (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IN ('owner','editor'));
GRANT UPDATE (quantity_raw, basis_raw, source_revision, state) ON app.positions TO journal_app;
CREATE POLICY positions_delete ON app.positions FOR DELETE TO journal_app
USING (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IN ('owner','editor'));
GRANT DELETE ON app.positions TO journal_app;
ALTER TABLE app.lots OWNER TO journal_migrator;
ALTER TABLE app.lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.lots FORCE ROW LEVEL SECURITY;
CREATE POLICY lots_read ON app.lots FOR SELECT TO journal_app
USING (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IS NOT NULL);
CREATE POLICY lots_insert ON app.lots FOR INSERT TO journal_app
WITH CHECK (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IN ('owner','editor'));
REVOKE ALL ON app.lots FROM PUBLIC;
GRANT SELECT, INSERT ON app.lots TO journal_app;
CREATE POLICY lots_update ON app.lots FOR UPDATE TO journal_app
USING (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IN ('owner','editor'))
WITH CHECK (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IN ('owner','editor'));
GRANT UPDATE (direction, remaining_quantity_raw, source_revision, state) ON app.lots TO journal_app;
CREATE POLICY lots_delete ON app.lots FOR DELETE TO journal_app
USING (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IN ('owner','editor'));
GRANT DELETE ON app.lots TO journal_app;
ALTER TABLE app.lot_matches OWNER TO journal_migrator;
ALTER TABLE app.lot_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.lot_matches FORCE ROW LEVEL SECURITY;
CREATE POLICY lot_matches_read ON app.lot_matches FOR SELECT TO journal_app
USING (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IS NOT NULL);
CREATE POLICY lot_matches_insert ON app.lot_matches FOR INSERT TO journal_app
WITH CHECK (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IN ('owner','editor'));
REVOKE ALL ON app.lot_matches FROM PUBLIC;
GRANT SELECT, INSERT ON app.lot_matches TO journal_app;
CREATE POLICY lot_matches_update ON app.lot_matches FOR UPDATE TO journal_app
USING (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IN ('owner','editor'))
WITH CHECK (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IN ('owner','editor'));
GRANT UPDATE (source_revision, payload) ON app.lot_matches TO journal_app;
CREATE POLICY lot_matches_delete ON app.lot_matches FOR DELETE TO journal_app
USING (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IN ('owner','editor'));
GRANT DELETE ON app.lot_matches TO journal_app;
ALTER TABLE app.allocation_sets OWNER TO journal_migrator;
ALTER TABLE app.allocation_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.allocation_sets FORCE ROW LEVEL SECURITY;
CREATE POLICY allocation_sets_read ON app.allocation_sets FOR SELECT TO journal_app
USING (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IS NOT NULL);
CREATE POLICY allocation_sets_insert ON app.allocation_sets FOR INSERT TO journal_app
WITH CHECK (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IN ('owner','editor'));
REVOKE ALL ON app.allocation_sets FROM PUBLIC;
GRANT SELECT, INSERT ON app.allocation_sets TO journal_app;
ALTER TABLE app.allocation_items OWNER TO journal_migrator;
ALTER TABLE app.allocation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.allocation_items FORCE ROW LEVEL SECURITY;
CREATE POLICY allocation_items_read ON app.allocation_items FOR SELECT TO journal_app
USING (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IS NOT NULL);
CREATE POLICY allocation_items_insert ON app.allocation_items FOR INSERT TO journal_app
WITH CHECK (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IN ('owner','editor'));
REVOKE ALL ON app.allocation_items FROM PUBLIC;
GRANT SELECT, INSERT ON app.allocation_items TO journal_app;
ALTER TABLE app.cost_attribution_sets OWNER TO journal_migrator;
ALTER TABLE app.cost_attribution_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.cost_attribution_sets FORCE ROW LEVEL SECURITY;
CREATE POLICY cost_attribution_sets_read ON app.cost_attribution_sets FOR SELECT TO journal_app
USING (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IS NOT NULL);
CREATE POLICY cost_attribution_sets_insert ON app.cost_attribution_sets FOR INSERT TO journal_app
WITH CHECK (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IN ('owner','editor'));
REVOKE ALL ON app.cost_attribution_sets FROM PUBLIC;
GRANT SELECT, INSERT ON app.cost_attribution_sets TO journal_app;
ALTER TABLE app.cost_allocations OWNER TO journal_migrator;
ALTER TABLE app.cost_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.cost_allocations FORCE ROW LEVEL SECURITY;
CREATE POLICY cost_allocations_read ON app.cost_allocations FOR SELECT TO journal_app
USING (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IS NOT NULL);
CREATE POLICY cost_allocations_insert ON app.cost_allocations FOR INSERT TO journal_app
WITH CHECK (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IN ('owner','editor'));
REVOKE ALL ON app.cost_allocations FROM PUBLIC;
GRANT SELECT, INSERT ON app.cost_allocations TO journal_app;
ALTER TABLE app.execution_supersessions OWNER TO journal_migrator;
ALTER TABLE app.execution_supersessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.execution_supersessions FORCE ROW LEVEL SECURITY;
CREATE POLICY execution_supersessions_read ON app.execution_supersessions FOR SELECT TO journal_app
USING (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IS NOT NULL);
CREATE POLICY execution_supersessions_insert ON app.execution_supersessions FOR INSERT TO journal_app
WITH CHECK (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IN ('owner','editor'));
REVOKE ALL ON app.execution_supersessions FROM PUBLIC;
GRANT SELECT, INSERT ON app.execution_supersessions TO journal_app;
ALTER TABLE app.fx_observations OWNER TO journal_migrator;
ALTER TABLE app.fx_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.fx_observations FORCE ROW LEVEL SECURITY;
CREATE POLICY fx_observations_read ON app.fx_observations FOR SELECT TO journal_app
USING (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IS NOT NULL);
CREATE POLICY fx_observations_insert ON app.fx_observations FOR INSERT TO journal_app
WITH CHECK (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IN ('owner','editor'));
REVOKE ALL ON app.fx_observations FROM PUBLIC;
GRANT SELECT, INSERT ON app.fx_observations TO journal_app;
ALTER TABLE app.price_observations OWNER TO journal_migrator;
ALTER TABLE app.price_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.price_observations FORCE ROW LEVEL SECURITY;
CREATE POLICY price_observations_read ON app.price_observations FOR SELECT TO journal_app
USING (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IS NOT NULL);
CREATE POLICY price_observations_insert ON app.price_observations FOR INSERT TO journal_app
WITH CHECK (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IN ('owner','editor'));
REVOKE ALL ON app.price_observations FROM PUBLIC;
GRANT SELECT, INSERT ON app.price_observations TO journal_app;
ALTER TABLE app.outbox_events OWNER TO journal_migrator;
ALTER TABLE app.outbox_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.outbox_events FORCE ROW LEVEL SECURITY;
CREATE POLICY outbox_events_read ON app.outbox_events FOR SELECT TO journal_app
USING (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IS NOT NULL);
CREATE POLICY outbox_events_insert ON app.outbox_events FOR INSERT TO journal_app
WITH CHECK (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IN ('owner','editor'));
REVOKE ALL ON app.outbox_events FROM PUBLIC;
GRANT SELECT, INSERT ON app.outbox_events TO journal_app;

--> statement-breakpoint
CREATE TABLE app.holding_transfers (
  workspace_id uuid NOT NULL REFERENCES app.workspaces(id),
  id uuid NOT NULL DEFAULT gen_random_uuid() CHECK (id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  actor_id text NOT NULL DEFAULT app.current_actor_id(),
  origin text NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual','import','broker','provider','calculated')),
  created_at timestamptz NOT NULL DEFAULT now(),
  command_id uuid NOT NULL,
  source_revision integer NOT NULL CHECK (source_revision > 0),
  source_account_id uuid NOT NULL,
  destination_account_id uuid NOT NULL,
  source_holding_book_id uuid NOT NULL,
  destination_holding_book_id uuid NOT NULL,
  instrument_version_id uuid NOT NULL,
  quantity_raw text NOT NULL,
  quantity numeric(78,36) GENERATED ALWAYS AS (app.financial_decimal(quantity_raw)) STORED CHECK (quantity > 0),
  economic_at timestamptz NOT NULL,
  ordering_key text NOT NULL,
  payload jsonb NOT NULL,
  PRIMARY KEY (workspace_id,id),
  FOREIGN KEY (workspace_id,command_id) REFERENCES app.financial_commands(workspace_id,id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (workspace_id,source_account_id) REFERENCES app.accounts(workspace_id,id),
  FOREIGN KEY (workspace_id,destination_account_id) REFERENCES app.accounts(workspace_id,id),
  FOREIGN KEY (workspace_id,source_holding_book_id) REFERENCES app.holding_books(workspace_id,id),
  FOREIGN KEY (workspace_id,destination_holding_book_id) REFERENCES app.holding_books(workspace_id,id),
  FOREIGN KEY (workspace_id,instrument_version_id) REFERENCES app.instrument_versions(workspace_id,id),
  CHECK (source_account_id <> destination_account_id AND source_holding_book_id <> destination_holding_book_id)
);
ALTER TABLE app.holding_transfers OWNER TO journal_migrator;
ALTER TABLE app.holding_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.holding_transfers FORCE ROW LEVEL SECURITY;
CREATE POLICY holding_transfers_read ON app.holding_transfers FOR SELECT TO journal_app
USING (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IS NOT NULL);
CREATE POLICY holding_transfers_insert ON app.holding_transfers FOR INSERT TO journal_app
WITH CHECK (workspace_id = app.current_workspace_id() AND app.actor_role(workspace_id) IN ('owner','editor'));
REVOKE ALL ON app.holding_transfers FROM PUBLIC;
GRANT SELECT, INSERT ON app.holding_transfers TO journal_app;
ALTER TABLE app.lots ADD CONSTRAINT lots_workspace_id_holding_transfer_id_fkey
FOREIGN KEY (workspace_id,holding_transfer_id) REFERENCES app.holding_transfers(workspace_id,id) DEFERRABLE INITIALLY DEFERRED;

-- Each transaction is serialized by the workspace financial-state row. Sources
-- and immutable outbox intents reference the command inserted at commit.
CREATE FUNCTION app.verify_financial_command() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog
AS $$
DECLARE current_revision integer;
BEGIN
  SELECT revision INTO current_revision FROM app.financial_state WHERE workspace_id = NEW.workspace_id;
  IF NEW.source_revision IS DISTINCT FROM current_revision THEN
    RAISE EXCEPTION 'Financial command revision does not match locked state' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM app.outbox_events WHERE workspace_id = NEW.workspace_id AND command_id = NEW.id AND source_revision = NEW.source_revision)
     OR NOT EXISTS (SELECT 1 FROM app.audit_events WHERE workspace_id = NEW.workspace_id AND id = NEW.audit_event_id AND actor_id = NEW.actor_id) THEN
    RAISE EXCEPTION 'Financial command requires atomic audit and outbox intent' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER financial_command_complete AFTER INSERT ON app.financial_commands
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.verify_financial_command();

CREATE FUNCTION app.verify_posted_event() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog
AS $$
DECLARE target_workspace uuid := NEW.workspace_id;
        target_event uuid;
        event_row app.ledger_events%ROWTYPE;
        posting_count bigint;
        native_sum numeric;
BEGIN
  IF TG_TABLE_NAME = 'ledger_events' THEN target_event := NEW.id;
  ELSE target_event := NEW.ledger_event_id;
  END IF;
  SELECT * INTO event_row FROM app.ledger_events WHERE workspace_id = target_workspace AND id = target_event;
  SELECT count(*), coalesce(sum(amount), 0) INTO posting_count, native_sum
    FROM app.postings WHERE workspace_id = target_workspace AND ledger_event_id = target_event;
  IF NOT FOUND OR posting_count < 2 OR native_sum <> 0 THEN
    RAISE EXCEPTION 'Posted event must contain at least two exactly balanced native-currency postings' USING ERRCODE = '23514';
  END IF;
  IF event_row.reversal_of_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM (
      SELECT currency_id, cash_bucket_id, control_key, sum(amount) AS amount
      FROM app.postings WHERE workspace_id = target_workspace AND ledger_event_id IN (target_event,event_row.reversal_of_id)
      GROUP BY currency_id,cash_bucket_id,control_key HAVING sum(amount) <> 0
    ) AS nonnegated
  ) THEN
    RAISE EXCEPTION 'Correction reversal must exactly negate original posting targets and currencies' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER ledger_event_balanced AFTER INSERT ON app.ledger_events
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.verify_posted_event();
CREATE CONSTRAINT TRIGGER posting_event_balanced AFTER INSERT ON app.postings
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.verify_posted_event();

CREATE FUNCTION app.verify_execution_allocations() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog
AS $$
DECLARE target_workspace uuid := NEW.workspace_id;
        target_set uuid;
        execution_row app.executions%ROWTYPE;
        allocated numeric;
        residual_count bigint;
BEGIN
  IF TG_TABLE_NAME = 'allocation_sets' THEN target_set := NEW.id;
  ELSE target_set := NEW.allocation_set_id;
  END IF;
  SELECT e.* INTO execution_row FROM app.executions e JOIN app.allocation_sets s
    ON s.workspace_id=e.workspace_id AND s.execution_id=e.id
    WHERE s.workspace_id=target_workspace AND s.id=target_set;
  SELECT coalesce(sum(quantity),0),count(*) FILTER (WHERE trade_leg_id IS NULL)
    INTO allocated,residual_count FROM app.allocation_items WHERE workspace_id=target_workspace AND allocation_set_id=target_set;
  IF allocated IS DISTINCT FROM execution_row.quantity OR residual_count <> 1 THEN
    RAISE EXCEPTION 'Allocation quantities must conserve the fill and include one unassigned residual' USING ERRCODE='23514';
  END IF;
  IF EXISTS (SELECT 1 FROM app.allocation_items i JOIN app.trade_legs l ON l.workspace_id=i.workspace_id AND l.id=i.trade_leg_id
    JOIN app.instrument_versions lv ON lv.workspace_id=l.workspace_id AND lv.id=l.instrument_version_id
    JOIN app.instrument_versions ev ON ev.workspace_id=execution_row.workspace_id AND ev.id=execution_row.instrument_version_id
    WHERE i.workspace_id=target_workspace AND i.allocation_set_id=target_set
      AND (l.account_id <> execution_row.account_id OR lv.instrument_id <> ev.instrument_id OR lv.quantity_unit <> ev.quantity_unit)) THEN
    RAISE EXCEPTION 'Campaign allocation must retain execution account and compatible instrument unit' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER allocation_set_conserves AFTER INSERT ON app.allocation_sets
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.verify_execution_allocations();
CREATE CONSTRAINT TRIGGER allocation_item_conserves AFTER INSERT ON app.allocation_items
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.verify_execution_allocations();

CREATE FUNCTION app.verify_cost_allocations() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog
AS $$
DECLARE target_set uuid;
        set_row app.cost_attribution_sets%ROWTYPE;
        fee_row app.fees%ROWTYPE;
        partitioned numeric;
        residual_count bigint;
BEGIN
  IF TG_TABLE_NAME='cost_attribution_sets' THEN target_set:=NEW.id;
  ELSE target_set:=NEW.attribution_set_id;
  END IF;
  SELECT * INTO set_row FROM app.cost_attribution_sets WHERE workspace_id=NEW.workspace_id AND id=target_set;
  SELECT * INTO fee_row FROM app.fees WHERE workspace_id=NEW.workspace_id AND id=set_row.fee_id;
  SELECT coalesce(sum(amount),0),count(*) FILTER (WHERE trade_leg_id IS NULL AND lot_id IS NULL AND coalesce(payload->>'target','unassigned')='unassigned')
    INTO partitioned,residual_count FROM app.cost_allocations WHERE workspace_id=NEW.workspace_id AND attribution_set_id=target_set;
  IF partitioned IS DISTINCT FROM fee_row.amount OR residual_count <> 1 OR EXISTS (
    SELECT 1 FROM app.cost_allocations WHERE workspace_id=NEW.workspace_id AND attribution_set_id=target_set
      AND (currency_id <> fee_row.currency_id OR (fee_row.amount > 0 AND amount < 0) OR (fee_row.amount < 0 AND amount > 0)
        OR (set_row.axis='campaign' AND (lot_id IS NOT NULL OR payload->>'target'='match')) OR (set_row.axis='inventory' AND trade_leg_id IS NOT NULL)
        OR (payload->>'target'='match' AND (lot_id IS NOT NULL OR trade_leg_id IS NOT NULL
          OR coalesce(char_length(payload->>'targetId'),0) NOT BETWEEN 1 AND 400
          OR NOT EXISTS (SELECT 1 FROM app.lot_matches m WHERE m.workspace_id=NEW.workspace_id AND m.payload->>'id'=app.cost_allocations.payload->>'targetId'))))
  ) THEN
    RAISE EXCEPTION 'Cost allocations must conserve each original currency and attribution axis with one residual' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER cost_set_conserves AFTER INSERT ON app.cost_attribution_sets
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.verify_cost_allocations();
CREATE CONSTRAINT TRIGGER cost_item_conserves AFTER INSERT ON app.cost_allocations
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.verify_cost_allocations();

CREATE FUNCTION app.require_current_canonical_revision() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog
AS $$
DECLARE current_revision integer;
BEGIN
  SELECT revision INTO current_revision FROM app.financial_state WHERE workspace_id=NEW.workspace_id;
  IF NEW.source_revision IS DISTINCT FROM current_revision THEN
    RAISE EXCEPTION 'Canonical inventory write must use the locked current source revision' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' AND NEW.source_revision < OLD.source_revision THEN
    RAISE EXCEPTION 'Older canonical state cannot overwrite a newer generation' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;

CREATE UNIQUE INDEX ledger_events_native_principal_idx ON app.ledger_events(workspace_id,execution_id) WHERE kind='execution-principal';
CREATE INDEX executions_book_order_idx ON app.executions(workspace_id,account_id,instrument_version_id,economic_at,ordering_key,id);
CREATE INDEX ledger_events_history_idx ON app.ledger_events(workspace_id,economic_at,id);
CREATE INDEX postings_bucket_idx ON app.postings(workspace_id,cash_bucket_id,ledger_event_id,id);
CREATE INDEX postings_event_idx ON app.postings(workspace_id,ledger_event_id,id);
CREATE INDEX allocation_items_leg_idx ON app.allocation_items(workspace_id,trade_leg_id,allocation_set_id,id);
CREATE INDEX outbox_source_idx ON app.outbox_events(workspace_id,source_revision,id);
CREATE INDEX fees_account_time_idx ON app.fees(workspace_id,account_id,economic_at,id);
CREATE INDEX fx_observations_pair_time_idx ON app.fx_observations(workspace_id,base_currency_id,quote_currency_id,observed_at,id);
CREATE INDEX price_observations_instrument_time_idx ON app.price_observations(workspace_id,instrument_version_id,observed_at,id);

CREATE TRIGGER holding_books_current_generation BEFORE INSERT OR UPDATE ON app.holding_books
FOR EACH ROW EXECUTE FUNCTION app.require_current_canonical_revision();

CREATE TRIGGER positions_current_generation BEFORE INSERT OR UPDATE ON app.positions
FOR EACH ROW EXECUTE FUNCTION app.require_current_canonical_revision();

CREATE TRIGGER lots_current_generation BEFORE INSERT OR UPDATE ON app.lots
FOR EACH ROW EXECUTE FUNCTION app.require_current_canonical_revision();

CREATE TRIGGER lot_matches_current_generation BEFORE INSERT OR UPDATE ON app.lot_matches
FOR EACH ROW EXECUTE FUNCTION app.require_current_canonical_revision();
ALTER FUNCTION app.verify_financial_command() OWNER TO journal_migrator;
REVOKE ALL ON FUNCTION app.verify_financial_command() FROM PUBLIC;
ALTER FUNCTION app.verify_posted_event() OWNER TO journal_migrator;
REVOKE ALL ON FUNCTION app.verify_posted_event() FROM PUBLIC;
ALTER FUNCTION app.verify_execution_allocations() OWNER TO journal_migrator;
REVOKE ALL ON FUNCTION app.verify_execution_allocations() FROM PUBLIC;
ALTER FUNCTION app.verify_cost_allocations() OWNER TO journal_migrator;
REVOKE ALL ON FUNCTION app.verify_cost_allocations() FROM PUBLIC;
ALTER FUNCTION app.require_current_canonical_revision() OWNER TO journal_migrator;
REVOKE ALL ON FUNCTION app.require_current_canonical_revision() FROM PUBLIC;

--> statement-breakpoint
CREATE FUNCTION app.guard_new_financial_source() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog
AS $$
DECLARE source_command uuid;
BEGIN
  IF current_user <> 'journal_app' THEN RETURN NEW; END IF;
  IF NEW.actor_id IS DISTINCT FROM app.current_actor_id() THEN
    RAISE EXCEPTION 'Source actor must be the verified current actor' USING ERRCODE='42501';
  END IF;
  IF TG_TABLE_NAME='postings' THEN
    SELECT command_id INTO source_command FROM app.ledger_events WHERE workspace_id=NEW.workspace_id AND id=NEW.ledger_event_id;
  ELSIF TG_TABLE_NAME='allocation_items' THEN
    SELECT command_id INTO source_command FROM app.allocation_sets WHERE workspace_id=NEW.workspace_id AND id=NEW.allocation_set_id;
  ELSIF TG_TABLE_NAME='cost_allocations' THEN
    SELECT command_id INTO source_command FROM app.cost_attribution_sets WHERE workspace_id=NEW.workspace_id AND id=NEW.attribution_set_id;
  ELSE source_command := NEW.command_id;
  END IF;
  IF EXISTS (SELECT 1 FROM app.financial_commands WHERE workspace_id=NEW.workspace_id AND id=source_command) THEN
    RAISE EXCEPTION 'Committed financial command cannot receive new source effects' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION app.verify_source_command_revision() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog
AS $$
DECLARE parent_revision integer;
BEGIN
  SELECT source_revision INTO parent_revision FROM app.financial_commands WHERE workspace_id=NEW.workspace_id AND id=NEW.command_id;
  IF parent_revision IS DISTINCT FROM NEW.source_revision THEN
    RAISE EXCEPTION 'Source fact revision must match its atomic financial command' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;

CREATE FUNCTION app.verify_canonical_inventory() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog
AS $$
DECLARE target_workspace uuid;
        target_book uuid;
        book_row app.holding_books%ROWTYPE;
        position_row app.positions%ROWTYPE;
        net_quantity numeric;
        input_quantity numeric;
        blocked_reason text;
        metric_name text;
BEGIN
  IF TG_OP='DELETE' THEN target_workspace:=OLD.workspace_id; target_book:=OLD.holding_book_id;
  ELSE
    target_workspace:=NEW.workspace_id;
    IF TG_TABLE_NAME='holding_books' THEN target_book:=NEW.id; ELSE target_book:=NEW.holding_book_id; END IF;
  END IF;
  SELECT * INTO book_row FROM app.holding_books WHERE workspace_id=target_workspace AND id=target_book;
  SELECT * INTO position_row FROM app.positions WHERE workspace_id=target_workspace AND holding_book_id=target_book;
  -- Operator-only deletion of an entire fixture/archive is allowed after all
  -- dependent rows are removed. Runtime roles cannot delete holding books.
  IF TG_OP='DELETE' AND current_user <> 'journal_app' AND book_row.id IS NULL THEN RETURN NULL; END IF;
  IF book_row.id IS NULL OR position_row.id IS NULL THEN
    RAISE EXCEPTION 'Canonical holding book requires one synchronized position' USING ERRCODE='23514';
  END IF;
  IF position_row.source_revision <> book_row.source_revision
    OR position_row.state IS DISTINCT FROM book_row.state
    OR position_row.basis IS DISTINCT FROM app.financial_decimal(book_row.state->'grossBasis'->>'value')
    OR position_row.quantity IS DISTINCT FROM app.financial_decimal(book_row.state->'openQuantity'->>'value') THEN
    RAISE EXCEPTION 'Canonical position must match the book generation and quantity availability' USING ERRCODE='23514';
  END IF;
  IF EXISTS (SELECT 1 FROM app.lots WHERE workspace_id=target_workspace AND holding_book_id=target_book
    AND (source_revision <> book_row.source_revision OR remaining_quantity IS DISTINCT FROM app.financial_decimal(state->>'remainingQuantity')
      OR direction IS DISTINCT FROM state->>'direction')) THEN
    RAISE EXCEPTION 'Canonical lot quantity, direction and revision must retain their source state' USING ERRCODE='23514';
  END IF;
  -- The quantity invariant does not depend on a calculation status supplied by
  -- the projection writer. Opening sources and effective fills contribute once;
  -- transfers move their signed lineage slices between books. Policy transitions
  -- and cost-attribution inventory events never create or destroy owned units.
  SELECT coalesce(sum(source.quantity),0) INTO input_quantity FROM (
    SELECT CASE WHEN e.side='buy' THEN e.quantity ELSE -e.quantity END AS quantity
      FROM app.executions e JOIN app.instrument_versions v
        ON v.workspace_id=e.workspace_id AND v.id=e.instrument_version_id
      WHERE e.workspace_id=target_workspace AND e.account_id=book_row.account_id
        AND v.instrument_id=book_row.instrument_id AND e.source_revision<=book_row.source_revision
        AND NOT EXISTS (SELECT 1 FROM app.execution_supersessions s
          WHERE s.workspace_id=e.workspace_id AND s.original_execution_id=e.id
            AND s.source_revision<=book_row.source_revision)
    UNION ALL
    SELECT CASE WHEN o.direction='long' THEN o.quantity ELSE -o.quantity END
      FROM app.opening_lots o JOIN app.instrument_versions v
        ON v.workspace_id=o.workspace_id AND v.id=o.instrument_version_id
      WHERE o.workspace_id=target_workspace AND o.account_id=book_row.account_id
        AND v.instrument_id=book_row.instrument_id AND o.source_revision<=book_row.source_revision
    UNION ALL
    SELECT app.financial_decimal(slice->>'quantity')
      * CASE WHEN slice->>'direction'='long' THEN 1 ELSE -1 END
      * CASE WHEN t.destination_holding_book_id=target_book THEN 1 ELSE -1 END
      FROM app.holding_transfers t
        CROSS JOIN LATERAL jsonb_array_elements(t.payload->'departure'->'slices') slice
      WHERE t.workspace_id=target_workspace AND t.source_revision<=book_row.source_revision
        AND (t.source_holding_book_id=target_book OR t.destination_holding_book_id=target_book)
  ) source;
  IF position_row.quantity IS DISTINCT FROM input_quantity
    OR book_row.state->'openQuantity'->>'status' IS DISTINCT FROM 'available'
    OR app.financial_decimal(book_row.state->'longQuantity'->>'value') IS DISTINCT FROM greatest(input_quantity,0)
    OR app.financial_decimal(book_row.state->'shortQuantity'->>'value') IS DISTINCT FROM greatest(-input_quantity,0) THEN
    RAISE EXCEPTION 'Canonical quantity must conserve signed effective financial source units' USING ERRCODE='23514';
  END IF;
  -- Unsupported or unresolved chronology retains known source quantity while
  -- deliberately creating no invented lot matches or basis.
  SELECT reason INTO blocked_reason FROM jsonb_array_elements_text(book_row.state->'reasons') reason
    WHERE reason IN ('ambiguous_chronology','ambiguous_ordering','unsupported_inventory_module',
      'unsupported_calculation_manifest','unsupported_short_inventory','unsupported_average_cost',
      'missing_settlement_currency','missing_inventory_multiplier','missing_inventory_price','missing_booked_principal') LIMIT 1;
  IF blocked_reason IS NOT NULL THEN
    IF book_row.state->>'status' IS DISTINCT FROM
      (CASE WHEN blocked_reason LIKE 'unsupported_%' THEN 'unsupported' ELSE 'unavailable' END)
      OR book_row.state->'lots' IS DISTINCT FROM '[]'::jsonb
      OR book_row.state->'matches' IS DISTINCT FROM '[]'::jsonb
      OR book_row.state->'transferredCosts' IS DISTINCT FROM '[]'::jsonb
      OR position_row.basis IS NOT NULL
      OR EXISTS (SELECT 1 FROM app.lots WHERE workspace_id=target_workspace AND holding_book_id=target_book AND remaining_quantity<>0)
      OR EXISTS (SELECT 1 FROM app.lot_matches WHERE workspace_id=target_workspace AND holding_book_id=target_book) THEN
      RAISE EXCEPTION 'Blocked inventory must retain quantity without invented active native lineage or basis' USING ERRCODE='23514';
    END IF;
    FOREACH metric_name IN ARRAY ARRAY['averageEntryPrice','grossBasis','netBasis','realizedGross','realizedNet'] LOOP
      IF book_row.state->metric_name->>'status' IS DISTINCT FROM book_row.state->>'status'
        OR book_row.state->metric_name->'value' IS DISTINCT FROM 'null'::jsonb
        OR NOT (book_row.state->metric_name->'reasons' ? blocked_reason) THEN
        RAISE EXCEPTION 'Blocked inventory cannot expose invented native financial results' USING ERRCODE='23514';
      END IF;
    END LOOP;
  ELSE
    SELECT coalesce(sum(CASE WHEN direction='long' THEN remaining_quantity ELSE -remaining_quantity END),0)
      INTO net_quantity FROM app.lots WHERE workspace_id=target_workspace AND holding_book_id=target_book;
    IF position_row.quantity IS DISTINCT FROM net_quantity THEN
      RAISE EXCEPTION 'Position quantity must equal signed remaining lot quantity' USING ERRCODE='23514';
    END IF;
    IF EXISTS (SELECT 1 FROM app.lots l WHERE l.workspace_id=target_workspace AND l.holding_book_id=target_book
      AND NOT EXISTS (SELECT 1 FROM app.execution_supersessions s WHERE s.workspace_id=l.workspace_id AND s.original_execution_id=l.execution_id)
      AND l.remaining_quantity + coalesce((SELECT sum(m.quantity) FROM app.lot_matches m WHERE m.workspace_id=l.workspace_id AND m.opening_lot_id=l.id),0)
        + coalesce((SELECT sum(app.financial_decimal(slice->>'quantity')) FROM app.holding_transfers t
          CROSS JOIN LATERAL jsonb_array_elements(t.payload->'departure'->'slices') slice
          WHERE t.workspace_id=l.workspace_id AND t.source_holding_book_id=l.holding_book_id
            AND t.source_revision<=book_row.source_revision AND slice->>'parentLotId'=l.id::text),0)
        IS DISTINCT FROM app.financial_decimal(l.state->>'originalQuantity')) THEN
      RAISE EXCEPTION 'Lot consumption and remaining quantity must conserve opening lineage' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NULL;
END $$;

CREATE FUNCTION app.verify_holding_transfer() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog
AS $$
DECLARE transferred_quantity numeric;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app.holding_books b JOIN app.instrument_versions v ON v.workspace_id=b.workspace_id AND v.id=b.instrument_version_id
    JOIN app.instrument_versions transfer_v ON transfer_v.workspace_id=NEW.workspace_id AND transfer_v.id=NEW.instrument_version_id
    WHERE b.workspace_id=NEW.workspace_id AND b.id=NEW.source_holding_book_id AND b.account_id=NEW.source_account_id
      AND v.instrument_id=transfer_v.instrument_id AND v.quantity_unit=transfer_v.quantity_unit)
    OR NOT EXISTS (SELECT 1 FROM app.holding_books b JOIN app.instrument_versions v ON v.workspace_id=b.workspace_id AND v.id=b.instrument_version_id
    JOIN app.instrument_versions transfer_v ON transfer_v.workspace_id=NEW.workspace_id AND transfer_v.id=NEW.instrument_version_id
    WHERE b.workspace_id=NEW.workspace_id AND b.id=NEW.destination_holding_book_id AND b.account_id=NEW.destination_account_id
      AND v.instrument_id=transfer_v.instrument_id AND v.quantity_unit=transfer_v.quantity_unit) THEN
    RAISE EXCEPTION 'Holding transfer must preserve compatible account/book/instrument ownership' USING ERRCODE='23514';
  END IF;
  IF jsonb_typeof(NEW.payload->'departure'->'slices') IS DISTINCT FROM 'array'
    OR jsonb_typeof(NEW.payload->'receipt'->'slices') IS DISTINCT FROM 'array'
    OR NEW.payload->'departure'->'slices' IS DISTINCT FROM NEW.payload->'receipt'->'slices' THEN
    RAISE EXCEPTION 'Holding departure and receipt must preserve identical lineage slices' USING ERRCODE='23514';
  END IF;
  SELECT coalesce(sum(app.financial_decimal(slice->>'quantity')),0) INTO transferred_quantity
    FROM jsonb_array_elements(NEW.payload->'departure'->'slices') slice;
  IF transferred_quantity IS DISTINCT FROM NEW.quantity OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(NEW.payload->'departure'->'slices') slice
      WHERE app.financial_decimal(slice->>'quantity') <= 0
        OR NOT EXISTS (SELECT 1 FROM app.lots l WHERE l.workspace_id=NEW.workspace_id
          AND l.holding_book_id=NEW.source_holding_book_id AND l.id::text=slice->>'parentLotId')
        OR NOT EXISTS (SELECT 1 FROM app.lots l WHERE l.workspace_id=NEW.workspace_id
          AND l.holding_book_id=NEW.destination_holding_book_id AND l.id::text=slice->>'id'
          AND l.holding_transfer_id=NEW.id)
  ) THEN
    RAISE EXCEPTION 'Holding transfer must conserve exact quantity and retain both source and destination lineage' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER holding_transfer_ownership AFTER INSERT ON app.holding_transfers
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.verify_holding_transfer();

UPDATE app.schema_metadata SET version = 3 WHERE singleton = true;

CREATE TRIGGER executions_new_command BEFORE INSERT ON app.executions FOR EACH ROW EXECUTE FUNCTION app.guard_new_financial_source();
CREATE CONSTRAINT TRIGGER executions_command_revision AFTER INSERT ON app.executions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.verify_source_command_revision();

CREATE TRIGGER opening_lots_new_command BEFORE INSERT ON app.opening_lots FOR EACH ROW EXECUTE FUNCTION app.guard_new_financial_source();
CREATE CONSTRAINT TRIGGER opening_lots_command_revision AFTER INSERT ON app.opening_lots DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.verify_source_command_revision();

CREATE TRIGGER fees_new_command BEFORE INSERT ON app.fees FOR EACH ROW EXECUTE FUNCTION app.guard_new_financial_source();
CREATE CONSTRAINT TRIGGER fees_command_revision AFTER INSERT ON app.fees DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.verify_source_command_revision();

CREATE TRIGGER cash_movements_new_command BEFORE INSERT ON app.cash_movements FOR EACH ROW EXECUTE FUNCTION app.guard_new_financial_source();
CREATE CONSTRAINT TRIGGER cash_movements_command_revision AFTER INSERT ON app.cash_movements DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.verify_source_command_revision();

CREATE TRIGGER fx_conversions_new_command BEFORE INSERT ON app.fx_conversions FOR EACH ROW EXECUTE FUNCTION app.guard_new_financial_source();
CREATE CONSTRAINT TRIGGER fx_conversions_command_revision AFTER INSERT ON app.fx_conversions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.verify_source_command_revision();

CREATE TRIGGER ledger_events_new_command BEFORE INSERT ON app.ledger_events FOR EACH ROW EXECUTE FUNCTION app.guard_new_financial_source();
CREATE CONSTRAINT TRIGGER ledger_events_command_revision AFTER INSERT ON app.ledger_events DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.verify_source_command_revision();

CREATE TRIGGER allocation_sets_new_command BEFORE INSERT ON app.allocation_sets FOR EACH ROW EXECUTE FUNCTION app.guard_new_financial_source();
CREATE CONSTRAINT TRIGGER allocation_sets_command_revision AFTER INSERT ON app.allocation_sets DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.verify_source_command_revision();

CREATE TRIGGER cost_attribution_sets_new_command BEFORE INSERT ON app.cost_attribution_sets FOR EACH ROW EXECUTE FUNCTION app.guard_new_financial_source();
CREATE CONSTRAINT TRIGGER cost_attribution_sets_command_revision AFTER INSERT ON app.cost_attribution_sets DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.verify_source_command_revision();

CREATE TRIGGER execution_supersessions_new_command BEFORE INSERT ON app.execution_supersessions FOR EACH ROW EXECUTE FUNCTION app.guard_new_financial_source();
CREATE CONSTRAINT TRIGGER execution_supersessions_command_revision AFTER INSERT ON app.execution_supersessions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.verify_source_command_revision();

CREATE TRIGGER holding_transfers_new_command BEFORE INSERT ON app.holding_transfers FOR EACH ROW EXECUTE FUNCTION app.guard_new_financial_source();
CREATE CONSTRAINT TRIGGER holding_transfers_command_revision AFTER INSERT ON app.holding_transfers DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.verify_source_command_revision();

CREATE TRIGGER postings_new_command BEFORE INSERT ON app.postings FOR EACH ROW EXECUTE FUNCTION app.guard_new_financial_source();

CREATE TRIGGER allocation_items_new_command BEFORE INSERT ON app.allocation_items FOR EACH ROW EXECUTE FUNCTION app.guard_new_financial_source();

CREATE TRIGGER cost_allocations_new_command BEFORE INSERT ON app.cost_allocations FOR EACH ROW EXECUTE FUNCTION app.guard_new_financial_source();

CREATE CONSTRAINT TRIGGER holding_books_quantity_conservation AFTER INSERT OR UPDATE ON app.holding_books DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.verify_canonical_inventory();

CREATE CONSTRAINT TRIGGER positions_quantity_conservation AFTER INSERT OR UPDATE OR DELETE ON app.positions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.verify_canonical_inventory();

CREATE CONSTRAINT TRIGGER lots_quantity_conservation AFTER INSERT OR UPDATE OR DELETE ON app.lots DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.verify_canonical_inventory();

CREATE CONSTRAINT TRIGGER lot_matches_quantity_conservation AFTER INSERT OR UPDATE OR DELETE ON app.lot_matches DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.verify_canonical_inventory();
ALTER FUNCTION app.guard_new_financial_source() OWNER TO journal_migrator;
REVOKE ALL ON FUNCTION app.guard_new_financial_source() FROM PUBLIC;
ALTER FUNCTION app.verify_source_command_revision() OWNER TO journal_migrator;
REVOKE ALL ON FUNCTION app.verify_source_command_revision() FROM PUBLIC;
ALTER FUNCTION app.verify_canonical_inventory() OWNER TO journal_migrator;
REVOKE ALL ON FUNCTION app.verify_canonical_inventory() FROM PUBLIC;
ALTER FUNCTION app.verify_holding_transfer() OWNER TO journal_migrator;
REVOKE ALL ON FUNCTION app.verify_holding_transfer() FROM PUBLIC;
--> statement-breakpoint
CREATE FUNCTION app.verify_source_monetary_effect() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog
AS $$
DECLARE source_workspace uuid := NEW.workspace_id;
        checked_source_id uuid;
        source_kind text;
        expected_amount numeric;
        actual_amount numeric;
        count_events bigint;
        source_currency uuid;
        source_bucket uuid;
        source_side text;
        conversion_row app.fx_conversions%ROWTYPE;
        execution_row app.executions%ROWTYPE;
        native_execution boolean;
        manual_effect record;
BEGIN
  IF TG_TABLE_NAME='ledger_events' THEN
    IF NEW.reversal_of_id IS NOT NULL THEN RETURN NULL; END IF;
    IF NEW.fee_id IS NOT NULL THEN source_kind:='fees'; checked_source_id:=NEW.fee_id;
    ELSIF NEW.cash_movement_id IS NOT NULL THEN source_kind:='cash_movements'; checked_source_id:=NEW.cash_movement_id;
    ELSIF NEW.execution_id IS NOT NULL THEN source_kind:='executions'; checked_source_id:=NEW.execution_id;
    ELSIF NEW.fx_conversion_id IS NOT NULL THEN source_kind:='fx_conversions'; checked_source_id:=NEW.fx_conversion_id;
    ELSE RETURN NULL; END IF;
  ELSE source_kind:=TG_TABLE_NAME; checked_source_id:=NEW.id;
  END IF;
  IF source_kind='fees' THEN
    SELECT -amount,currency_id INTO expected_amount,source_currency FROM app.fees WHERE workspace_id=source_workspace AND id=checked_source_id;
    SELECT count(DISTINCT e.id),coalesce(sum(p.amount),0) INTO count_events,actual_amount
      FROM app.ledger_events e LEFT JOIN app.postings p ON p.workspace_id=e.workspace_id AND p.ledger_event_id=e.id AND p.cash_bucket_id IS NOT NULL
      WHERE e.workspace_id=source_workspace AND e.fee_id=checked_source_id AND e.currency_id=source_currency;
    IF count_events<>1 OR actual_amount<>expected_amount THEN
      RAISE EXCEPTION 'One fee must produce exactly one conserved cash charge or rebate' USING ERRCODE='23514';
    END IF;
  ELSIF source_kind='cash_movements' THEN
    SELECT amount,currency_id,cash_bucket_id INTO expected_amount,source_currency,source_bucket FROM app.cash_movements WHERE workspace_id=source_workspace AND id=checked_source_id;
    SELECT count(DISTINCT e.id),coalesce(sum(p.amount),0) INTO count_events,actual_amount
      FROM app.ledger_events e LEFT JOIN app.postings p ON p.workspace_id=e.workspace_id AND p.ledger_event_id=e.id AND p.cash_bucket_id=source_bucket
      WHERE e.workspace_id=source_workspace AND e.cash_movement_id=checked_source_id AND e.currency_id=source_currency;
    IF count_events<>1 OR actual_amount<>expected_amount THEN
      RAISE EXCEPTION 'Cash source amount must equal its unique actual bucket effect' USING ERRCODE='23514';
    END IF;
  ELSIF source_kind='executions' THEN
    SELECT * INTO execution_row FROM app.executions WHERE workspace_id=source_workspace AND id=checked_source_id;
    SELECT capability='native-linear' INTO native_execution FROM app.instrument_versions
      WHERE workspace_id=source_workspace AND id=execution_row.instrument_version_id;
    native_execution := native_execution AND coalesce((SELECT holding_mode FROM app.account_settings_versions
      WHERE workspace_id=source_workspace AND account_id=execution_row.account_id AND effective_at<=execution_row.economic_at
      ORDER BY effective_at DESC,version DESC LIMIT 1),'netted')='netted';
    IF NOT native_execution THEN
      IF jsonb_typeof(coalesce(execution_row.payload->'manualCashEffects','[]'::jsonb)) <> 'array' THEN
        RAISE EXCEPTION 'Manual settlement must retain explicit source cash effects' USING ERRCODE='23514';
      END IF;
      SELECT count(*) INTO count_events FROM app.ledger_events WHERE workspace_id=source_workspace AND execution_id=checked_source_id AND kind='manual-settlement';
      IF count_events <> jsonb_array_length(coalesce(execution_row.payload->'manualCashEffects','[]'::jsonb)) THEN
        RAISE EXCEPTION 'Manual source settlement effects must be booked exactly once' USING ERRCODE='23514';
      END IF;
      FOR manual_effect IN SELECT value,ordinality FROM jsonb_array_elements(coalesce(execution_row.payload->'manualCashEffects','[]'::jsonb)) WITH ORDINALITY LOOP
        SELECT count(DISTINCT e.id),coalesce(sum(p.amount),0) INTO count_events,actual_amount
          FROM app.ledger_events e LEFT JOIN app.postings p ON p.workspace_id=e.workspace_id AND p.ledger_event_id=e.id
            AND p.cash_bucket_id=(manual_effect.value->>'cashBucketId')::uuid
          WHERE e.workspace_id=source_workspace AND e.execution_id=checked_source_id AND e.kind='manual-settlement'
            AND e.effect_key='execution:'||checked_source_id::text||':manual:'||(manual_effect.ordinality-1)::text
            AND e.currency_id=(manual_effect.value->>'currencyId')::uuid;
        IF count_events<>1 OR actual_amount IS DISTINCT FROM app.financial_decimal(manual_effect.value->>'amount') THEN
          RAISE EXCEPTION 'Manual settlement must conserve each actual source bucket amount and currency' USING ERRCODE='23514';
        END IF;
      END LOOP;
      RETURN NULL;
    END IF;
    IF execution_row.price IS NULL OR execution_row.price<=0 OR EXISTS (
      SELECT 1 FROM app.instrument_versions v WHERE v.workspace_id=source_workspace AND v.id=execution_row.instrument_version_id
        AND (mod(execution_row.quantity,v.quantity_increment)<>0 OR mod(execution_row.price,v.price_increment)<>0)
    ) THEN
      RAISE EXCEPTION 'Native execution needs a known positive quote and pinned quantity/price increments' USING ERRCODE='23514';
    END IF;
    expected_amount:=execution_row.principal; source_currency:=execution_row.principal_currency_id; source_side:=execution_row.side;
    IF expected_amount IS NULL THEN RETURN NULL; END IF;
    IF source_side='buy' THEN expected_amount:=-expected_amount; END IF;
    SELECT count(DISTINCT e.id),coalesce(sum(p.amount),0) INTO count_events,actual_amount
      FROM app.ledger_events e LEFT JOIN app.postings p ON p.workspace_id=e.workspace_id AND p.ledger_event_id=e.id AND p.cash_bucket_id IS NOT NULL
      WHERE e.workspace_id=source_workspace AND e.execution_id=checked_source_id AND e.currency_id=source_currency AND e.kind='execution-principal';
    IF count_events<>1 OR actual_amount<>expected_amount THEN
      RAISE EXCEPTION 'Execution principal must be posted once at its recorded booked amount' USING ERRCODE='23514';
    END IF;
  ELSE
    SELECT * INTO conversion_row FROM app.fx_conversions WHERE workspace_id=source_workspace AND id=checked_source_id;
    IF (SELECT currency_id FROM app.cash_buckets WHERE workspace_id=source_workspace AND id=conversion_row.source_bucket_id)
       = (SELECT currency_id FROM app.cash_buckets WHERE workspace_id=source_workspace AND id=conversion_row.destination_bucket_id) THEN
      RAISE EXCEPTION 'An FX conversion must exchange distinct monetary units' USING ERRCODE='23514';
    END IF;
    SELECT count(*) INTO count_events FROM app.ledger_events WHERE workspace_id=source_workspace AND fx_conversion_id=checked_source_id;
    SELECT coalesce(sum(p.amount),0) INTO actual_amount FROM app.ledger_events e JOIN app.postings p ON p.workspace_id=e.workspace_id AND p.ledger_event_id=e.id
      WHERE e.workspace_id=source_workspace AND e.fx_conversion_id=checked_source_id AND p.cash_bucket_id=conversion_row.source_bucket_id;
    IF count_events<>2 OR actual_amount<>-conversion_row.source_amount THEN
      RAISE EXCEPTION 'FX source amount must be debited once with native currency balancing' USING ERRCODE='23514';
    END IF;
    SELECT coalesce(sum(p.amount),0) INTO actual_amount FROM app.ledger_events e JOIN app.postings p ON p.workspace_id=e.workspace_id AND p.ledger_event_id=e.id
      WHERE e.workspace_id=source_workspace AND e.fx_conversion_id=checked_source_id AND p.cash_bucket_id=conversion_row.destination_bucket_id;
    IF actual_amount<>conversion_row.destination_amount THEN
      RAISE EXCEPTION 'FX destination amount must be credited once at its actual booked amount' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER fees_monetary_conservation AFTER INSERT ON app.fees DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.verify_source_monetary_effect();

CREATE CONSTRAINT TRIGGER cash_movements_monetary_conservation AFTER INSERT ON app.cash_movements DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.verify_source_monetary_effect();

CREATE CONSTRAINT TRIGGER executions_monetary_conservation AFTER INSERT ON app.executions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.verify_source_monetary_effect();

CREATE CONSTRAINT TRIGGER fx_conversions_monetary_conservation AFTER INSERT ON app.fx_conversions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.verify_source_monetary_effect();

CREATE CONSTRAINT TRIGGER ledger_events_monetary_conservation AFTER INSERT ON app.ledger_events DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.verify_source_monetary_effect();
ALTER FUNCTION app.verify_source_monetary_effect() OWNER TO journal_migrator;
REVOKE ALL ON FUNCTION app.verify_source_monetary_effect() FROM PUBLIC;
--> statement-breakpoint
CREATE TABLE app.inventory_events (
  workspace_id uuid NOT NULL REFERENCES app.workspaces(id),
  id uuid NOT NULL DEFAULT gen_random_uuid() CHECK (id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  actor_id text NOT NULL DEFAULT app.current_actor_id(),
  origin text NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual','import','broker','provider','calculated')),
  created_at timestamptz NOT NULL DEFAULT now(),
  command_id uuid NOT NULL,
  source_revision integer NOT NULL CHECK (source_revision > 0),
  account_id uuid NOT NULL,
  instrument_version_id uuid NOT NULL,
  economic_at timestamptz NOT NULL,
  ordering_key text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('policy-transition','cost-attribution')),
  payload jsonb NOT NULL,
  PRIMARY KEY (workspace_id,id),
  FOREIGN KEY (workspace_id,command_id) REFERENCES app.financial_commands(workspace_id,id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (workspace_id,account_id) REFERENCES app.accounts(workspace_id,id),
  FOREIGN KEY (workspace_id,instrument_version_id) REFERENCES app.instrument_versions(workspace_id,id)
);
ALTER TABLE app.inventory_events OWNER TO journal_migrator;
ALTER TABLE app.inventory_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.inventory_events FORCE ROW LEVEL SECURITY;
CREATE POLICY inventory_events_read ON app.inventory_events FOR SELECT TO journal_app
USING (workspace_id=app.current_workspace_id() AND app.actor_role(workspace_id) IS NOT NULL);
CREATE POLICY inventory_events_insert ON app.inventory_events FOR INSERT TO journal_app
WITH CHECK (workspace_id=app.current_workspace_id() AND app.actor_role(workspace_id) IN ('owner','editor'));
REVOKE ALL ON app.inventory_events FROM PUBLIC;
GRANT SELECT,INSERT ON app.inventory_events TO journal_app;
CREATE INDEX inventory_events_book_order_idx ON app.inventory_events(workspace_id,account_id,instrument_version_id,economic_at,ordering_key,id);
CREATE TRIGGER inventory_events_new_command BEFORE INSERT ON app.inventory_events FOR EACH ROW EXECUTE FUNCTION app.guard_new_financial_source();
CREATE CONSTRAINT TRIGGER inventory_events_command_revision AFTER INSERT ON app.inventory_events DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.verify_source_command_revision();

CREATE TABLE app.trade_closures (
  workspace_id uuid NOT NULL REFERENCES app.workspaces(id),
  id uuid NOT NULL DEFAULT gen_random_uuid() CHECK (id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  actor_id text NOT NULL DEFAULT app.current_actor_id(),
  origin text NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual','import','broker','provider','calculated')),
  created_at timestamptz NOT NULL DEFAULT now(),
  command_id uuid NOT NULL,
  source_revision integer NOT NULL CHECK (source_revision > 0),
  trade_id uuid NOT NULL,
  definition_version text NOT NULL CHECK (char_length(definition_version) BETWEEN 1 AND 120),
  confirmed_at timestamptz NOT NULL,
  payload jsonb NOT NULL,
  PRIMARY KEY (workspace_id,id),
  FOREIGN KEY (workspace_id,command_id) REFERENCES app.financial_commands(workspace_id,id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (workspace_id,trade_id) REFERENCES app.trades(workspace_id,id)
);
ALTER TABLE app.trade_closures OWNER TO journal_migrator;
ALTER TABLE app.trade_closures ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.trade_closures FORCE ROW LEVEL SECURITY;
CREATE POLICY trade_closures_read ON app.trade_closures FOR SELECT TO journal_app
USING (workspace_id=app.current_workspace_id() AND app.actor_role(workspace_id) IS NOT NULL);
CREATE POLICY trade_closures_insert ON app.trade_closures FOR INSERT TO journal_app
WITH CHECK (workspace_id=app.current_workspace_id() AND app.actor_role(workspace_id) IN ('owner','editor'));
REVOKE ALL ON app.trade_closures FROM PUBLIC;
GRANT SELECT,INSERT ON app.trade_closures TO journal_app;
CREATE INDEX trade_closures_history_idx ON app.trade_closures(workspace_id,trade_id,source_revision,id);
CREATE TRIGGER trade_closures_new_command BEFORE INSERT ON app.trade_closures FOR EACH ROW EXECUTE FUNCTION app.guard_new_financial_source();
CREATE CONSTRAINT TRIGGER trade_closures_command_revision AFTER INSERT ON app.trade_closures DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.verify_source_command_revision();
--> statement-breakpoint
CREATE TABLE app.account_valuation_observations (
  workspace_id uuid NOT NULL REFERENCES app.workspaces(id),
  id uuid NOT NULL DEFAULT gen_random_uuid() CHECK (id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  actor_id text NOT NULL DEFAULT app.current_actor_id(),
  origin text NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual','import','broker','provider','calculated')),
  created_at timestamptz NOT NULL DEFAULT now(),
  account_id uuid NOT NULL,
  currency_id uuid NOT NULL,
  amount_raw text NOT NULL,
  amount numeric(78,36) GENERATED ALWAYS AS (app.financial_decimal(amount_raw)) STORED,
  observed_at timestamptz NOT NULL,
  definition text NOT NULL CHECK (char_length(definition) BETWEEN 1 AND 160),
  source text NOT NULL CHECK (char_length(source) BETWEEN 1 AND 200),
  supersedes_id uuid,
  payload jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (workspace_id,id),
  FOREIGN KEY (workspace_id,account_id) REFERENCES app.accounts(workspace_id,id),
  FOREIGN KEY (workspace_id,currency_id) REFERENCES app.currencies(workspace_id,id),
  FOREIGN KEY (workspace_id,supersedes_id) REFERENCES app.account_valuation_observations(workspace_id,id)
);
ALTER TABLE app.account_valuation_observations OWNER TO journal_migrator;
ALTER TABLE app.account_valuation_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.account_valuation_observations FORCE ROW LEVEL SECURITY;
CREATE POLICY account_valuation_observations_read ON app.account_valuation_observations FOR SELECT TO journal_app
USING (workspace_id=app.current_workspace_id() AND app.actor_role(workspace_id) IS NOT NULL);
CREATE POLICY account_valuation_observations_insert ON app.account_valuation_observations FOR INSERT TO journal_app
WITH CHECK (workspace_id=app.current_workspace_id() AND app.actor_role(workspace_id) IN ('owner','editor'));
REVOKE ALL ON app.account_valuation_observations FROM PUBLIC;
GRANT SELECT,INSERT ON app.account_valuation_observations TO journal_app;
CREATE INDEX account_valuation_observations_history_idx ON app.account_valuation_observations(workspace_id,account_id,observed_at,id);
--> statement-breakpoint
-- Settlement reclassifies a sourced obligation; it is never a second principal.
-- Retain the typed execution FK while independently checking both cash buckets
-- and every accepted chronological prefix, including future-dated settlements.
CREATE FUNCTION app.verify_execution_settlement() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog
AS $$
DECLARE execution_row app.executions%ROWTYPE;
        source_bucket uuid;
        source_amount numeric;
        posting_count bigint;
        unsettled_count bigint;
        settled_count bigint;
        outstanding numeric := 0;
        movement record;
BEGIN
  IF NEW.kind <> 'settlement' THEN RETURN NULL; END IF;
  SELECT * INTO execution_row FROM app.executions WHERE workspace_id=NEW.workspace_id AND id=NEW.execution_id;
  IF execution_row.id IS NULL OR execution_row.principal IS NULL
    OR execution_row.principal_currency_id IS DISTINCT FROM NEW.currency_id
    OR NEW.economic_at < execution_row.economic_at
    OR EXISTS (SELECT 1 FROM app.execution_supersessions WHERE workspace_id=NEW.workspace_id AND original_execution_id=execution_row.id) THEN
    RAISE EXCEPTION 'Settlement requires an effective sourced execution obligation in the same monetary unit' USING ERRCODE='23514';
  END IF;
  SELECT count(*),count(*) FILTER (WHERE b.category='unsettled'),count(*) FILTER (WHERE b.category='settled')
    INTO posting_count,unsettled_count,settled_count
    FROM app.postings p LEFT JOIN app.cash_buckets b ON b.workspace_id=p.workspace_id AND b.id=p.cash_bucket_id
    WHERE p.workspace_id=NEW.workspace_id AND p.ledger_event_id=NEW.id;
  IF posting_count<>2 OR unsettled_count<>1 OR settled_count<>1 OR EXISTS (
    SELECT 1 FROM app.postings p JOIN app.cash_buckets b ON b.workspace_id=p.workspace_id AND b.id=p.cash_bucket_id
    WHERE p.workspace_id=NEW.workspace_id AND p.ledger_event_id=NEW.id
      AND (b.account_id<>execution_row.account_id OR b.currency_id<>NEW.currency_id OR p.amount=0)
  ) THEN
    RAISE EXCEPTION 'Settlement must move one nonzero obligation between owned unsettled and settled cash buckets' USING ERRCODE='23514';
  END IF;
  SELECT p.cash_bucket_id,p.amount INTO source_bucket,source_amount FROM app.postings p
    JOIN app.cash_buckets b ON b.workspace_id=p.workspace_id AND b.id=p.cash_bucket_id
    WHERE p.workspace_id=NEW.workspace_id AND p.ledger_event_id=NEW.id AND b.category='unsettled';
  FOR movement IN
    SELECT e.economic_at,e.source_revision,
      coalesce(sum(p.amount) FILTER (WHERE e.kind<>'settlement'),0) AS source_delta,
      coalesce(sum(p.amount) FILTER (WHERE e.kind='settlement'),0) AS settlement_delta
    FROM app.ledger_events e JOIN app.postings p ON p.workspace_id=e.workspace_id AND p.ledger_event_id=e.id
      LEFT JOIN app.fees f ON f.workspace_id=e.workspace_id AND f.id=e.fee_id
    WHERE e.workspace_id=NEW.workspace_id AND p.cash_bucket_id=source_bucket
      AND ((e.execution_id=execution_row.id AND e.kind IN ('execution-principal','settlement'))
        OR (f.execution_id=execution_row.id AND f.account_id=execution_row.account_id AND f.currency_id=NEW.currency_id))
    GROUP BY e.economic_at,e.source_revision ORDER BY e.economic_at,e.source_revision
  LOOP
    outstanding := outstanding + movement.source_delta;
    IF movement.settlement_delta<>0 AND (outstanding=0
      OR sign(movement.settlement_delta)=sign(outstanding)
      OR abs(movement.settlement_delta)>abs(outstanding)) THEN
      RAISE EXCEPTION 'Settlement cannot consume an unsourced or already consumed obligation at any chronological boundary' USING ERRCODE='23514';
    END IF;
    outstanding := outstanding + movement.settlement_delta;
  END LOOP;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER ledger_execution_settlement_conserves AFTER INSERT ON app.ledger_events
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.verify_execution_settlement();
ALTER FUNCTION app.verify_execution_settlement() OWNER TO journal_migrator;
REVOKE ALL ON FUNCTION app.verify_execution_settlement() FROM PUBLIC;
