-- Native positive-price and settlement guards remain in force. Manual source
-- quotes may be signed; their unsupported automatic calculations stay disabled.
ALTER TABLE app.executions DROP CONSTRAINT executions_price_check;
ALTER TABLE app.opening_lots DROP CONSTRAINT opening_lots_price_check;
ALTER TABLE app.price_observations DROP CONSTRAINT price_observations_price_check;
--> statement-breakpoint
CREATE FUNCTION app.guard_financial_source_convention() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE convention app.instrument_versions; source_at timestamptz;
BEGIN
  SELECT * INTO convention FROM app.instrument_versions
    WHERE workspace_id=NEW.workspace_id AND id=NEW.instrument_version_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME='price_observations' THEN source_at:=NEW.observed_at;
  ELSE source_at:=NEW.economic_at; END IF;
  IF source_at<convention.effective_at THEN
    RAISE EXCEPTION 'The financial source convention is not effective at its economic instant' USING ERRCODE='23514';
  END IF;
  IF app.financial_decimal(NEW.price_raw)<0 AND convention.capability<>'manual' THEN
    RAISE EXCEPTION 'Negative source quotes require manual recording capability' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER execution_source_convention BEFORE INSERT ON app.executions
  FOR EACH ROW EXECUTE FUNCTION app.guard_financial_source_convention();
CREATE TRIGGER opening_source_convention BEFORE INSERT ON app.opening_lots
  FOR EACH ROW EXECUTE FUNCTION app.guard_financial_source_convention();
CREATE TRIGGER price_source_convention BEFORE INSERT ON app.price_observations
  FOR EACH ROW EXECUTE FUNCTION app.guard_financial_source_convention();
ALTER FUNCTION app.guard_financial_source_convention() OWNER TO journal_migrator;
REVOKE ALL ON FUNCTION app.guard_financial_source_convention() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.guard_financial_source_convention() TO journal_app;
UPDATE app.schema_metadata SET version=16 WHERE singleton=true;
