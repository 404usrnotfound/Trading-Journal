-- Additive label-integrity correction. Published migration 0005 is unchanged.
-- ECMAScript String.trim uses this exact WhiteSpace/LineTerminator set. PostgreSQL
-- btrim(text) only handles ASCII space and POSIX [:space:] has different semantics.
CREATE FUNCTION app.journal_trim(value text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE SET search_path = pg_catalog
AS $$ SELECT btrim(value,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF') $$;
CREATE FUNCTION app.valid_journal_plan_labels(definition jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog
AS $$ BEGIN
  IF NOT app.valid_journal_plan(definition) THEN RETURN false; END IF;
  RETURN jsonb_typeof(definition->'initialRisk')='null'
    OR app.journal_text_length(app.journal_trim(definition->'initialRisk'->>'method')) BETWEEN 1 AND 160;
END $$;
CREATE FUNCTION app.valid_journal_document_labels(document jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog
AS $$ DECLARE key text; item jsonb;
BEGIN
  IF NOT app.valid_journal_document(document) OR NOT app.valid_journal_plan_labels(document->'plan') THEN RETURN false; END IF;
  FOREACH key IN ARRAY ARRAY['mistakes','emotions','customTags'] LOOP
    FOR item IN SELECT value FROM jsonb_array_elements(document->'review'->key) LOOP
      IF app.journal_text_length(app.journal_trim(item #>> '{}')) NOT BETWEEN 1 AND 160 THEN RETURN false; END IF;
    END LOOP;
    -- Labels are normalized before shared-contract uniqueness validation. Distinct
    -- raw spellings that trim to the same value would make persisted JSON unreadable.
    IF (SELECT count(*)<>count(DISTINCT app.journal_trim(value #>> '{}'))
      FROM jsonb_array_elements(document->'review'->key)) THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END $$;
ALTER FUNCTION app.journal_trim(text) OWNER TO journal_migrator;
REVOKE ALL ON FUNCTION app.journal_trim(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.journal_trim(text) TO journal_app;
ALTER FUNCTION app.valid_journal_plan_labels(jsonb) OWNER TO journal_migrator;
REVOKE ALL ON FUNCTION app.valid_journal_plan_labels(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.valid_journal_plan_labels(jsonb) TO journal_app;
ALTER FUNCTION app.valid_journal_document_labels(jsonb) OWNER TO journal_migrator;
REVOKE ALL ON FUNCTION app.valid_journal_document_labels(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.valid_journal_document_labels(jsonb) TO journal_app;
--> statement-breakpoint
ALTER TABLE "app"."journal_plan_versions" ADD CONSTRAINT "journal_plan_versions_labels_check" CHECK (app.valid_journal_plan_labels("app"."journal_plan_versions"."definition"));--> statement-breakpoint
ALTER TABLE "app"."journal_plan_versions" ADD CONSTRAINT "journal_plan_versions_reason_nonblank_check" CHECK (app.journal_text_length(app.journal_trim("app"."journal_plan_versions"."change_reason")) BETWEEN 1 AND 2000);--> statement-breakpoint
ALTER TABLE "app"."journal_revisions" ADD CONSTRAINT "journal_revisions_labels_check" CHECK (app.valid_journal_document_labels("app"."journal_revisions"."document"));--> statement-breakpoint
ALTER TABLE "app"."journal_revisions" ADD CONSTRAINT "journal_revisions_reason_nonblank_check" CHECK (app.journal_text_length(app.journal_trim("app"."journal_revisions"."change_reason")) BETWEEN 1 AND 2000);--> statement-breakpoint
ALTER TABLE "app"."journal_risk_additions" ADD CONSTRAINT "journal_risk_additions_method_nonblank_check" CHECK (app.journal_text_length(app.journal_trim("app"."journal_risk_additions"."method")) BETWEEN 1 AND 160);--> statement-breakpoint
ALTER TABLE "app"."journal_risk_additions" ADD CONSTRAINT "journal_risk_additions_reason_nonblank_check" CHECK (app.journal_text_length(app.journal_trim("app"."journal_risk_additions"."reason")) BETWEEN 1 AND 2000);
--> statement-breakpoint
UPDATE app.schema_metadata SET version=7 WHERE singleton=true;
