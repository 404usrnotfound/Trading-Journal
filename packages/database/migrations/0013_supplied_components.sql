-- Explicit source-valued alternatives; these observations never post cash or grant native pricing.
CREATE TABLE app.supplied_components (
 workspace_id uuid NOT NULL REFERENCES app.workspaces(id),id uuid NOT NULL DEFAULT gen_random_uuid(),
 actor_id text NOT NULL DEFAULT app.current_actor_id(),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 command_id uuid NOT NULL,source_revision integer NOT NULL CHECK(source_revision>0),
 basis_revision integer NOT NULL CHECK(basis_revision>=0 AND basis_revision=source_revision-1),
 kind text NOT NULL CHECK(kind IN ('position-equity','campaign-net-result')),
 account_id uuid,instrument_version_id uuid,trade_id uuid,currency_id uuid NOT NULL,
 amount_raw text NOT NULL,amount numeric(78,36) GENERATED ALWAYS AS(app.financial_decimal(amount_raw)) STORED,
 quantity_raw text,quantity numeric(78,36) GENERATED ALWAYS AS(app.financial_decimal(quantity_raw)) STORED,
 observed_at timestamptz NOT NULL,definition_version text NOT NULL,source text NOT NULL CHECK(length(btrim(source)) BETWEEN 1 AND 160),
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object' AND octet_length(payload::text)<=32768),
 supersedes_id uuid,
 PRIMARY KEY(workspace_id,id),UNIQUE(workspace_id,command_id),UNIQUE(workspace_id,supersedes_id),
 CHECK((kind='position-equity' AND account_id IS NOT NULL AND instrument_version_id IS NOT NULL AND trade_id IS NULL AND quantity_raw IS NOT NULL AND definition_version='residual-position-equity/1') OR (kind='campaign-net-result' AND account_id IS NULL AND instrument_version_id IS NULL AND trade_id IS NOT NULL AND quantity_raw IS NULL AND definition_version='lifetime-campaign-net-result/1')),
 FOREIGN KEY(workspace_id,command_id) REFERENCES app.financial_commands(workspace_id,id) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(workspace_id,account_id) REFERENCES app.accounts(workspace_id,id),
 FOREIGN KEY(workspace_id,instrument_version_id) REFERENCES app.instrument_versions(workspace_id,id),
 FOREIGN KEY(workspace_id,trade_id) REFERENCES app.trades(workspace_id,id),
 FOREIGN KEY(workspace_id,currency_id) REFERENCES app.currencies(workspace_id,id),
 FOREIGN KEY(workspace_id,supersedes_id) REFERENCES app.supplied_components(workspace_id,id)
);
CREATE INDEX supplied_components_scope_time ON app.supplied_components(workspace_id,kind,account_id,instrument_version_id,trade_id,observed_at,id);
ALTER TABLE app.supplied_components OWNER TO journal_migrator;
ALTER TABLE app.supplied_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.supplied_components FORCE ROW LEVEL SECURITY;
REVOKE ALL ON app.supplied_components FROM PUBLIC;
CREATE POLICY supplied_components_read ON app.supplied_components FOR SELECT TO journal_app USING(workspace_id=app.current_workspace_id() AND app.actor_role(workspace_id) IS NOT NULL);
CREATE POLICY supplied_components_insert ON app.supplied_components FOR INSERT TO journal_app WITH CHECK(workspace_id=app.current_workspace_id() AND actor_id=app.current_actor_id() AND app.actor_role(workspace_id) IN('owner','editor'));
GRANT SELECT,INSERT ON app.supplied_components TO journal_app;
CREATE TRIGGER supplied_components_immutable BEFORE UPDATE OR DELETE ON app.supplied_components FOR EACH ROW EXECUTE FUNCTION app.reject_accounting_history_mutation();
CREATE TRIGGER supplied_components_new_command BEFORE INSERT ON app.supplied_components FOR EACH ROW EXECUTE FUNCTION app.guard_new_financial_source();
CREATE CONSTRAINT TRIGGER supplied_components_command_revision AFTER INSERT ON app.supplied_components DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.verify_source_command_revision();
--> statement-breakpoint
CREATE FUNCTION app.verify_supplied_component() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE command app.financial_commands; original app.supplied_components;
BEGIN
 SELECT * INTO command FROM app.financial_commands WHERE workspace_id=NEW.workspace_id AND id=NEW.command_id;
 IF command.kind IS DISTINCT FROM 'supplied-component.recorded' OR command.result->>'id' IS DISTINCT FROM NEW.id::text THEN
  RAISE EXCEPTION 'Supplied observations require their atomic command result' USING ERRCODE='23514';
 END IF;
 IF NEW.payload->>'kind' IS DISTINCT FROM NEW.kind OR NEW.payload->>'currencyId' IS DISTINCT FROM NEW.currency_id::text OR (NEW.payload->>'observedAt')::timestamptz IS DISTINCT FROM NEW.observed_at OR app.financial_decimal(NEW.payload->>'amount') IS DISTINCT FROM NEW.amount OR length(btrim(COALESCE(NEW.payload->>'sourceReference',''))) NOT BETWEEN 1 AND 4000 THEN
  RAISE EXCEPTION 'Supplied value and provenance must retain their typed source intent' USING ERRCODE='23514';
 END IF;
 IF NEW.kind='position-equity' AND (NEW.payload->>'accountId' IS DISTINCT FROM NEW.account_id::text OR NEW.payload->>'instrumentVersionId' IS DISTINCT FROM NEW.instrument_version_id::text OR app.financial_decimal(NEW.payload->>'signedQuantity') IS DISTINCT FROM NEW.quantity OR NEW.payload->>'cashExcluded' IS DISTINCT FROM 'true' OR NEW.payload->>'collateralExcluded' IS DISTINCT FROM 'true' OR NEW.payload->>'settledPnlExcluded' IS DISTINCT FROM 'true' OR NEW.payload->>'unsettledCashExcluded' IS DISTINCT FROM 'true') THEN
  RAISE EXCEPTION 'Position component must exclude cash, collateral and already settled value' USING ERRCODE='23514';
 END IF;
 IF NEW.kind='position-equity' AND NOT EXISTS(SELECT 1 FROM app.instrument_versions v WHERE v.workspace_id=NEW.workspace_id AND v.id=NEW.instrument_version_id AND v.capability='manual' AND v.effective_at<=NEW.observed_at) THEN
  RAISE EXCEPTION 'Supplied position values require an effective manual instrument convention' USING ERRCODE='23514';
 END IF;
 IF NEW.kind='campaign-net-result' AND (NEW.payload->>'tradeId' IS DISTINCT FROM NEW.trade_id::text OR NEW.payload->>'costsComplete' IS DISTINCT FROM 'true') THEN
  RAISE EXCEPTION 'Supplied campaign net result must include all source costs' USING ERRCODE='23514';
 END IF;
 IF NEW.kind='campaign-net-result' AND NOT EXISTS(SELECT 1 FROM app.trade_legs l JOIN app.instrument_versions v ON v.workspace_id=l.workspace_id AND v.id=l.instrument_version_id WHERE l.workspace_id=NEW.workspace_id AND l.trade_id=NEW.trade_id AND v.capability='manual') THEN
  RAISE EXCEPTION 'Supplied campaign results require a manual instrument leg' USING ERRCODE='23514';
 END IF;
 IF NEW.supersedes_id IS NOT NULL THEN
  SELECT * INTO original FROM app.supplied_components WHERE workspace_id=NEW.workspace_id AND id=NEW.supersedes_id;
  IF original.kind IS DISTINCT FROM NEW.kind OR original.account_id IS DISTINCT FROM NEW.account_id OR original.instrument_version_id IS DISTINCT FROM NEW.instrument_version_id OR original.trade_id IS DISTINCT FROM NEW.trade_id OR original.source_revision>=NEW.source_revision THEN
   RAISE EXCEPTION 'Supplied correction must retain its original scope and history' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION app.verify_supplied_component() OWNER TO journal_migrator;
REVOKE ALL ON FUNCTION app.verify_supplied_component() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.verify_supplied_component() TO journal_app;
CREATE CONSTRAINT TRIGGER supplied_components_source_intent AFTER INSERT ON app.supplied_components DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.verify_supplied_component();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.portable_workspace_tables() RETURNS TABLE(name text)
LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT item FROM unnest(ARRAY[
 'audit_events','financial_state','currencies','currency_convention_versions','brokers','accounts','account_settings_versions','cash_buckets','instruments','instrument_versions','trades','trade_legs','orders','order_legs','order_revisions','financial_commands','executions','opening_lots','fees','cash_movements','fx_conversions','ledger_events','postings','holding_books','positions','lots','lot_matches','allocation_sets','allocation_items','cost_attribution_sets','cost_allocations','execution_supersessions','fx_observations','price_observations','outbox_events','holding_transfers','inventory_events','trade_closures','account_valuation_observations','strategies','strategy_attachments','strategy_commands','strategy_version_attachments','strategy_versions','trade_strategy_links','journal_commands','journal_entries','journal_plan_attachments','journal_plan_commitments','journal_plan_versions','journal_revision_attachments','journal_revisions','journal_risk_additions','account_cash_events','cash_transfer_receipts','cash_transfers','portfolio_version_accounts','portfolio_versions','portfolios','import_template_versions','import_batches','import_rows','import_operations','import_sources','import_source_history','portable_restore_history','source_statements','statement_reconciliations','risk_policies','risk_policy_versions','risk_commands','risk_assessments','risk_assessment_policies',
 'period_review_templates','period_review_template_versions','period_review_entries','period_review_versions','period_review_commands','period_review_trades','period_review_strategies','supplied_components'
 ]::text[]) item WHERE to_regclass(format('app.%I',item)) IS NOT NULL ORDER BY item
$$;
ALTER FUNCTION app.portable_workspace_tables() OWNER TO journal_migrator;
REVOKE ALL ON FUNCTION app.portable_workspace_tables() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.portable_workspace_tables() TO journal_app;
UPDATE app.schema_metadata SET version=14 WHERE singleton=true;
