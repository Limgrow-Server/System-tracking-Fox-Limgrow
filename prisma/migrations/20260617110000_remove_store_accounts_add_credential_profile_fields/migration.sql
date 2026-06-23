-- Store-name-first credential profile migration.
-- The separate android/ios store account tables no longer have a clear runtime
-- purpose. Store profile metadata now lives directly on credential rows.

ALTER TABLE "android_credentials"
  ADD COLUMN IF NOT EXISTS "link_store" TEXT,
  ADD COLUMN IF NOT EXISTS "avatar_url" TEXT;

ALTER TABLE "ios_credentials"
  ADD COLUMN IF NOT EXISTS "link_store" TEXT,
  ADD COLUMN IF NOT EXISTS "avatar_url" TEXT;

CREATE OR REPLACE FUNCTION pg_temp.system_tracking_config_metadata("input_description" TEXT)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
BEGIN
  IF "input_description" LIKE 'credential_config:%' THEN
    RETURN SUBSTRING("input_description" FROM LENGTH('credential_config:') + 1)::JSONB;
  END IF;

  IF "input_description" LIKE 'android_config:%' THEN
    RETURN SUBSTRING("input_description" FROM LENGTH('android_config:') + 1)::JSONB;
  END IF;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

UPDATE "android_credentials"
SET
  "link_store" = COALESCE(
    "link_store",
    NULLIF(pg_temp.system_tracking_config_metadata("description") ->> 'linkStore', '')
  ),
  "avatar_url" = COALESCE(
    "avatar_url",
    NULLIF(pg_temp.system_tracking_config_metadata("description") ->> 'avatarUrl', '')
  )
WHERE "description" LIKE 'credential_config:%'
  OR "description" LIKE 'android_config:%';

UPDATE "ios_credentials"
SET
  "link_store" = COALESCE(
    "link_store",
    NULLIF(pg_temp.system_tracking_config_metadata("description") ->> 'linkStore', '')
  ),
  "avatar_url" = COALESCE(
    "avatar_url",
    NULLIF(pg_temp.system_tracking_config_metadata("description") ->> 'avatarUrl', '')
  )
WHERE "description" LIKE 'credential_config:%'
  OR "description" LIKE 'android_config:%';

UPDATE "android_store_mappings" AS "mapping"
SET
  "store_account_name" = COALESCE(NULLIF(BTRIM("mapping"."store_account_name"), ''), "account"."account_name"),
  "google_play_developer_id" = COALESCE("mapping"."google_play_developer_id", "account"."developer_account_id")
FROM "android_store_accounts" AS "account"
WHERE "mapping"."store_account_id" = "account"."id";

UPDATE "ios_store_mappings" AS "mapping"
SET
  "store_account_name" = COALESCE(NULLIF(BTRIM("mapping"."store_account_name"), ''), "account"."account_name"),
  "apple_team_id" = COALESCE("mapping"."apple_team_id", "account"."apple_team_id")
FROM "ios_store_accounts" AS "account"
WHERE "mapping"."store_account_id" = "account"."id";

ALTER TABLE "android_store_mappings"
  DROP CONSTRAINT IF EXISTS "android_store_mappings_store_account_id_fkey";

ALTER TABLE "ios_store_mappings"
  DROP CONSTRAINT IF EXISTS "ios_store_mappings_store_account_id_fkey";

ALTER TABLE "android_store_mappings"
  DROP COLUMN IF EXISTS "store_account_id";

ALTER TABLE "ios_store_mappings"
  DROP COLUMN IF EXISTS "store_account_id";

DROP TABLE IF EXISTS "android_store_accounts";
DROP TABLE IF EXISTS "ios_store_accounts";

DROP TYPE IF EXISTS "account_status";
