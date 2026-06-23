-- App-name-first App Mapping cleanup.
-- This migration must be reviewed and applied manually with `prisma migrate deploy`.
-- It renames mapping product_app_id to app_name and removes legacy/provider fields
-- that are no longer part of the current Store Mapping / Credential Vault flow.

DROP INDEX IF EXISTS "android_store_mappings_account_app_env_key";
DROP INDEX IF EXISTS "android_store_mappings_package_env_key";
DROP INDEX IF EXISTS "android_store_mappings_package_status_idx";
DROP INDEX IF EXISTS "android_store_mappings_account_app_idx";
DROP INDEX IF EXISTS "ios_store_mappings_account_app_env_key";
DROP INDEX IF EXISTS "ios_store_mappings_bundle_env_key";
DROP INDEX IF EXISTS "ios_store_mappings_bundle_status_idx";
DROP INDEX IF EXISTS "ios_store_mappings_account_app_idx";

DROP INDEX IF EXISTS "android_credentials_store_env_purpose_key";
DROP INDEX IF EXISTS "android_credentials_store_purpose_status_idx";
DROP INDEX IF EXISTS "android_credentials_mapping_idx";
DROP INDEX IF EXISTS "ios_credentials_store_env_purpose_key";
DROP INDEX IF EXISTS "ios_credentials_store_purpose_status_idx";
DROP INDEX IF EXISTS "ios_credentials_mapping_idx";

ALTER TABLE "android_credentials"
  DROP CONSTRAINT IF EXISTS "android_credentials_android_store_mapping_id_fkey";

ALTER TABLE "ios_credentials"
  DROP CONSTRAINT IF EXISTS "ios_credentials_ios_store_mapping_id_fkey";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'android_store_mappings'
      AND column_name = 'product_app_id'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'android_store_mappings'
      AND column_name = 'app_name'
  ) THEN
    ALTER TABLE "android_store_mappings" RENAME COLUMN "product_app_id" TO "app_name";
  ELSIF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'android_store_mappings'
      AND column_name = 'product_app_id'
  ) THEN
    UPDATE "android_store_mappings"
    SET "app_name" = COALESCE(NULLIF(BTRIM("app_name"), ''), "product_app_id")
    WHERE NULLIF(BTRIM("app_name"), '') IS NULL;

    ALTER TABLE "android_store_mappings" DROP COLUMN "product_app_id";
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ios_store_mappings'
      AND column_name = 'product_app_id'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ios_store_mappings'
      AND column_name = 'app_name'
  ) THEN
    ALTER TABLE "ios_store_mappings" RENAME COLUMN "product_app_id" TO "app_name";
  ELSIF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ios_store_mappings'
      AND column_name = 'product_app_id'
  ) THEN
    UPDATE "ios_store_mappings"
    SET "app_name" = COALESCE(NULLIF(BTRIM("app_name"), ''), "product_app_id")
    WHERE NULLIF(BTRIM("app_name"), '') IS NULL;

    ALTER TABLE "ios_store_mappings" DROP COLUMN "product_app_id";
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "android_store_mappings"
    GROUP BY "store_account_name", "app_name"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'android_store_mappings has duplicate store_account_name + app_name rows';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "android_store_mappings"
    GROUP BY "package_name"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'android_store_mappings has duplicate package_name rows';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "ios_store_mappings"
    GROUP BY "store_account_name", "app_name"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'ios_store_mappings has duplicate store_account_name + app_name rows';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "ios_store_mappings"
    GROUP BY "bundle_id"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'ios_store_mappings has duplicate bundle_id rows';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "android_credentials"
    GROUP BY "store_account_name", "credential_purpose"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'android_credentials has duplicate store_account_name + credential_purpose rows';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "ios_credentials"
    GROUP BY "store_account_name", "credential_purpose"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'ios_credentials has duplicate store_account_name + credential_purpose rows';
  END IF;
END
$$;

ALTER TABLE "android_store_mappings"
  DROP COLUMN IF EXISTS "environment",
  DROP COLUMN IF EXISTS "firebase_project_id",
  DROP COLUMN IF EXISTS "firebase_project_number",
  DROP COLUMN IF EXISTS "firebase_app_id",
  DROP COLUMN IF EXISTS "firebase_sender_id",
  DROP COLUMN IF EXISTS "firebase_service_account_email",
  DROP COLUMN IF EXISTS "fcm_api_enabled",
  DROP COLUMN IF EXISTS "google_play_developer_id",
  DROP COLUMN IF EXISTS "google_service_account_email",
  DROP COLUMN IF EXISTS "google_credential_capabilities",
  DROP COLUMN IF EXISTS "google_play_api_enabled",
  DROP COLUMN IF EXISTS "google_play_permissions_status",
  DROP COLUMN IF EXISTS "credential_status",
  DROP COLUMN IF EXISTS "last_preflight_at",
  DROP COLUMN IF EXISTS "last_preflight_result",
  DROP COLUMN IF EXISTS "last_preflight_error_code",
  DROP COLUMN IF EXISTS "last_successful_operation_at",
  DROP COLUMN IF EXISTS "scan_enabled";

ALTER TABLE "ios_store_mappings"
  DROP COLUMN IF EXISTS "environment",
  DROP COLUMN IF EXISTS "apple_app_id",
  DROP COLUMN IF EXISTS "apple_team_id",
  DROP COLUMN IF EXISTS "apple_asc_issuer_id",
  DROP COLUMN IF EXISTS "apple_asc_key_id",
  DROP COLUMN IF EXISTS "apple_iap_issuer_id",
  DROP COLUMN IF EXISTS "apple_iap_key_id",
  DROP COLUMN IF EXISTS "apns_key_id",
  DROP COLUMN IF EXISTS "apns_environment",
  DROP COLUMN IF EXISTS "apns_config_status",
  DROP COLUMN IF EXISTS "firebase_project_id",
  DROP COLUMN IF EXISTS "firebase_project_number",
  DROP COLUMN IF EXISTS "firebase_app_id",
  DROP COLUMN IF EXISTS "firebase_sender_id",
  DROP COLUMN IF EXISTS "firebase_service_account_email",
  DROP COLUMN IF EXISTS "fcm_api_enabled",
  DROP COLUMN IF EXISTS "credential_status",
  DROP COLUMN IF EXISTS "last_preflight_at",
  DROP COLUMN IF EXISTS "last_preflight_result",
  DROP COLUMN IF EXISTS "last_preflight_error_code",
  DROP COLUMN IF EXISTS "last_successful_operation_at",
  DROP COLUMN IF EXISTS "scan_enabled";

ALTER TABLE "android_credentials"
  DROP COLUMN IF EXISTS "android_store_mapping_id",
  DROP COLUMN IF EXISTS "product_app_id",
  DROP COLUMN IF EXISTS "environment",
  DROP COLUMN IF EXISTS "package_name",
  DROP COLUMN IF EXISTS "scopes",
  DROP COLUMN IF EXISTS "capabilities";

ALTER TABLE "ios_credentials"
  DROP COLUMN IF EXISTS "ios_store_mapping_id",
  DROP COLUMN IF EXISTS "product_app_id",
  DROP COLUMN IF EXISTS "environment",
  DROP COLUMN IF EXISTS "bundle_id",
  DROP COLUMN IF EXISTS "team_id",
  DROP COLUMN IF EXISTS "capabilities";

CREATE UNIQUE INDEX "android_store_mappings_account_app_name_key"
  ON "android_store_mappings"("store_account_name", "app_name");

CREATE UNIQUE INDEX "android_store_mappings_package_key"
  ON "android_store_mappings"("package_name");

CREATE INDEX "android_store_mappings_package_status_idx"
  ON "android_store_mappings"("package_name", "status");

CREATE INDEX "android_store_mappings_account_app_idx"
  ON "android_store_mappings"("store_account_name", "app_name");

CREATE UNIQUE INDEX "ios_store_mappings_account_app_name_key"
  ON "ios_store_mappings"("store_account_name", "app_name");

CREATE UNIQUE INDEX "ios_store_mappings_bundle_key"
  ON "ios_store_mappings"("bundle_id");

CREATE INDEX "ios_store_mappings_bundle_status_idx"
  ON "ios_store_mappings"("bundle_id", "status");

CREATE INDEX "ios_store_mappings_account_app_idx"
  ON "ios_store_mappings"("store_account_name", "app_name");

CREATE UNIQUE INDEX "android_credentials_store_purpose_key"
  ON "android_credentials"("store_account_name", "credential_purpose");

CREATE INDEX "android_credentials_store_purpose_status_idx"
  ON "android_credentials"("store_account_name", "credential_purpose", "status");

CREATE UNIQUE INDEX "ios_credentials_store_purpose_key"
  ON "ios_credentials"("store_account_name", "credential_purpose");

CREATE INDEX "ios_credentials_store_purpose_status_idx"
  ON "ios_credentials"("store_account_name", "credential_purpose", "status");

DROP TYPE IF EXISTS "credential_status";
DROP TYPE IF EXISTS "apple_push_environment";
