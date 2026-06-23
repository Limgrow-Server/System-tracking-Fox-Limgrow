DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "android_credentials"
    GROUP BY "store_profile_id"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'android_credentials contains duplicate store_profile_id rows';
  END IF;
END $$;

ALTER TABLE "android_credentials"
  DROP COLUMN IF EXISTS "secret_type",
  DROP COLUMN IF EXISTS "secret_format",
  DROP COLUMN IF EXISTS "credential_purpose";

DROP TYPE IF EXISTS "android_secret_type";

CREATE UNIQUE INDEX IF NOT EXISTS "android_credentials_profile_key"
  ON "android_credentials"("store_profile_id");

CREATE INDEX IF NOT EXISTS "android_credentials_store_status_idx"
  ON "android_credentials"("store_account_name", "status");

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "ios_credentials"
    WHERE "credential_purpose"::text = 'google_play'
  ) THEN
    RAISE EXCEPTION 'ios_credentials contains google_play credential_purpose rows';
  END IF;
END $$;

ALTER TYPE "credential_purpose" RENAME TO "credential_purpose_old";

CREATE TYPE "credential_purpose" AS ENUM (
  'firebase_admin',
  'review',
  'iap'
);

ALTER TABLE "ios_credentials"
  ALTER COLUMN "credential_purpose" TYPE "credential_purpose"
  USING "credential_purpose"::text::"credential_purpose";

DROP TYPE "credential_purpose_old";
