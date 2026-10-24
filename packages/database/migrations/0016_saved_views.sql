-- Private per-membership display state; deliberately excluded from workspace archives.
ALTER TABLE app.user_preferences ADD COLUMN saved_views jsonb NOT NULL DEFAULT '{}'::jsonb,
 ADD COLUMN view_revision integer NOT NULL DEFAULT 0 CHECK(view_revision>=0),
 ADD CONSTRAINT preference_saved_views_bound CHECK(jsonb_typeof(saved_views)='object' AND octet_length(saved_views::text)<=262144 AND (saved_views - ARRAY['dashboard','journal','strategies']::text[])='{}'::jsonb);
GRANT UPDATE(saved_views,view_revision) ON app.user_preferences TO journal_app;
UPDATE app.schema_metadata SET version=17 WHERE singleton=true;
