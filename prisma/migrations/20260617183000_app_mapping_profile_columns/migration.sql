-- Move App Mapping profile URLs out of notes into explicit columns.
-- Existing app-generated notes are JSON shaped as:
-- {"__app_mapping_ui":{"app_icon_url":"...","app_link":"..."},"legacy_notes":null}

ALTER TABLE "public"."android_store_mappings"
  ADD COLUMN "app_icon_url" TEXT,
  ADD COLUMN "app_link" TEXT;

ALTER TABLE "public"."ios_store_mappings"
  ADD COLUMN "app_icon_url" TEXT,
  ADD COLUMN "app_link" TEXT;

UPDATE "public"."android_store_mappings"
SET
  "app_icon_url" = NULLIF("notes"::jsonb #>> '{__app_mapping_ui,app_icon_url}', ''),
  "app_link" = NULLIF("notes"::jsonb #>> '{__app_mapping_ui,app_link}', '')
WHERE "notes" LIKE '{"__app_mapping_ui":%';

UPDATE "public"."ios_store_mappings"
SET
  "app_icon_url" = NULLIF("notes"::jsonb #>> '{__app_mapping_ui,app_icon_url}', ''),
  "app_link" = NULLIF("notes"::jsonb #>> '{__app_mapping_ui,app_link}', '')
WHERE "notes" LIKE '{"__app_mapping_ui":%';

ALTER TABLE "public"."android_store_mappings"
  DROP COLUMN "notes";

ALTER TABLE "public"."ios_store_mappings"
  DROP COLUMN "notes";
