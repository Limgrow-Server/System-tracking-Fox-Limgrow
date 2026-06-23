-- Store-name-first App Mapping and credential purpose migration.
-- App Mapping no longer stores credential refs. Credentials are resolved by
-- store_account_name + environment + credential_purpose.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "android_credentials"
    WHERE "secret_type"::text NOT IN ('google_play_service_account', 'firebase_service_account')
  ) THEN
    RAISE EXCEPTION 'android_credentials contains unsupported secret_type values for this migration';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "ios_credentials"
    WHERE "secret_type"::text NOT IN ('apple_asc_p8', 'apple_iap_p8', 'firebase_service_account')
  ) THEN
    RAISE EXCEPTION 'ios_credentials contains unsupported secret_type values for this migration';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'credential_purpose'
  ) THEN
    CREATE TYPE "credential_purpose" AS ENUM (
      'firebase_admin',
      'review',
      'iap',
      'google_play'
    );
  END IF;
END
$$;

ALTER TABLE "android_store_mappings"
  DROP COLUMN IF EXISTS "firebase_credential_ref",
  DROP COLUMN IF EXISTS "google_play_credential_ref";

ALTER TABLE "ios_store_mappings"
  DROP COLUMN IF EXISTS "apple_asc_credential_ref",
  DROP COLUMN IF EXISTS "apple_iap_credential_ref",
  DROP COLUMN IF EXISTS "apns_credential_ref",
  DROP COLUMN IF EXISTS "firebase_credential_ref";

ALTER TABLE "android_credentials"
  ADD COLUMN IF NOT EXISTS "credential_purpose" "credential_purpose";

ALTER TABLE "ios_credentials"
  ADD COLUMN IF NOT EXISTS "credential_purpose" "credential_purpose";

UPDATE "android_credentials"
SET "credential_purpose" = CASE "secret_type"::text
  WHEN 'google_play_service_account' THEN 'google_play'::"credential_purpose"
  WHEN 'firebase_service_account' THEN 'firebase_admin'::"credential_purpose"
END
WHERE "credential_purpose" IS NULL;

UPDATE "ios_credentials"
SET "credential_purpose" = CASE "secret_type"::text
  WHEN 'apple_asc_p8' THEN 'review'::"credential_purpose"
  WHEN 'apple_iap_p8' THEN 'iap'::"credential_purpose"
  WHEN 'firebase_service_account' THEN 'firebase_admin'::"credential_purpose"
END
WHERE "credential_purpose" IS NULL;

UPDATE "android_credentials" AS "credential"
SET "store_account_name" = COALESCE(
  NULLIF(BTRIM("credential"."store_account_name"), ''),
  "mapping"."store_account_name",
  "credential"."credential_ref"
)
FROM "android_store_mappings" AS "mapping"
WHERE "credential"."android_store_mapping_id" = "mapping"."id"
  AND NULLIF(BTRIM("credential"."store_account_name"), '') IS NULL;

UPDATE "android_credentials"
SET "store_account_name" = "credential_ref"
WHERE NULLIF(BTRIM("store_account_name"), '') IS NULL;

UPDATE "ios_credentials" AS "credential"
SET "store_account_name" = COALESCE(
  NULLIF(BTRIM("credential"."store_account_name"), ''),
  "mapping"."store_account_name",
  "credential"."credential_ref"
)
FROM "ios_store_mappings" AS "mapping"
WHERE "credential"."ios_store_mapping_id" = "mapping"."id"
  AND NULLIF(BTRIM("credential"."store_account_name"), '') IS NULL;

UPDATE "ios_credentials"
SET "store_account_name" = "credential_ref"
WHERE NULLIF(BTRIM("store_account_name"), '') IS NULL;

ALTER TABLE "android_credentials"
  ALTER COLUMN "credential_purpose" SET NOT NULL,
  ALTER COLUMN "store_account_name" SET NOT NULL,
  DROP COLUMN IF EXISTS "key_encryption_version";

ALTER TABLE "ios_credentials"
  ALTER COLUMN "credential_purpose" SET NOT NULL,
  ALTER COLUMN "store_account_name" SET NOT NULL,
  DROP COLUMN IF EXISTS "key_encryption_version";

DROP INDEX IF EXISTS "android_credentials_store_env_purpose_key";
DROP INDEX IF EXISTS "ios_credentials_store_env_purpose_key";
DROP INDEX IF EXISTS "android_credentials_store_purpose_status_idx";
DROP INDEX IF EXISTS "ios_credentials_store_purpose_status_idx";

CREATE UNIQUE INDEX "android_credentials_store_env_purpose_key"
  ON "android_credentials"("store_account_name", "environment", "credential_purpose");

CREATE UNIQUE INDEX "ios_credentials_store_env_purpose_key"
  ON "ios_credentials"("store_account_name", "environment", "credential_purpose");

CREATE INDEX "android_credentials_store_purpose_status_idx"
  ON "android_credentials"("store_account_name", "environment", "credential_purpose", "status");

CREATE INDEX "ios_credentials_store_purpose_status_idx"
  ON "ios_credentials"("store_account_name", "environment", "credential_purpose", "status");

ALTER TYPE "android_secret_type" RENAME TO "android_secret_type_old";
CREATE TYPE "android_secret_type" AS ENUM (
  'google_play_service_account',
  'firebase_service_account'
);

ALTER TABLE "android_credentials"
  ALTER COLUMN "secret_type" TYPE "android_secret_type"
  USING "secret_type"::text::"android_secret_type";

DROP TYPE "android_secret_type_old";

ALTER TYPE "ios_secret_type" RENAME TO "ios_secret_type_old";
CREATE TYPE "ios_secret_type" AS ENUM (
  'apple_asc_p8',
  'apple_iap_p8',
  'firebase_service_account'
);

ALTER TABLE "ios_credentials"
  ALTER COLUMN "secret_type" TYPE "ios_secret_type"
  USING "secret_type"::text::"ios_secret_type";

DROP TYPE "ios_secret_type_old";
