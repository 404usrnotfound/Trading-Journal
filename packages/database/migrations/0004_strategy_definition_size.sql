-- Forward-only correction: published migration 0003 and accepted snapshots remain unchanged.
-- Count JSON's compact UTF-8 representation structurally. PostgreSQL's jsonb text
-- inserts formatting spaces; removing text delimiters would corrupt string contents.
CREATE FUNCTION app.strategy_json_bytes(document jsonb) RETURNS integer
LANGUAGE plpgsql IMMUTABLE STRICT SET search_path = pg_catalog
AS $$
DECLARE total integer := 2; first_element boolean := true; field record; element jsonb;
BEGIN
  CASE jsonb_typeof(document)
    WHEN 'object' THEN
      FOR field IN SELECT key, value FROM jsonb_each(document) LOOP
        IF NOT first_element THEN total := total + 1; END IF;
        total := total + octet_length(convert_to(to_jsonb(field.key)::text, 'UTF8')) + 1
          + app.strategy_json_bytes(field.value);
        first_element := false;
      END LOOP;
    WHEN 'array' THEN
      FOR element IN SELECT value FROM jsonb_array_elements(document) LOOP
        IF NOT first_element THEN total := total + 1; END IF;
        total := total + app.strategy_json_bytes(element);
        first_element := false;
      END LOOP;
    ELSE RETURN octet_length(convert_to(document::text, 'UTF8'));
  END CASE;
  RETURN total;
END $$;
ALTER FUNCTION app.strategy_json_bytes(jsonb) OWNER TO journal_migrator;
REVOKE ALL ON FUNCTION app.strategy_json_bytes(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.strategy_json_bytes(jsonb) TO journal_app;
--> statement-breakpoint
ALTER TABLE "app"."strategy_versions" ADD CONSTRAINT "strategy_versions_definition_size_check" CHECK (app.strategy_json_bytes("app"."strategy_versions"."definition") <= 196608);
--> statement-breakpoint
UPDATE app.schema_metadata SET version = 5 WHERE singleton = true;
