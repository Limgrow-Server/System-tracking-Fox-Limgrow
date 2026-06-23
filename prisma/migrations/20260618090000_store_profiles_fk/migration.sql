-- Introduce provider/store profiles as the shared parent for mappings and credentials.
-- Credential rows remain one row per secret purpose; app mappings and credentials now link through store_profile_id.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "android_store_mappings"
    WHERE NULLIF(BTRIM("store_account_name"), '') IS NULL
  ) OR EXISTS (
    SELECT 1
    FROM "android_credentials"
    WHERE NULLIF(BTRIM("store_account_name"), '') IS NULL
  ) THEN
    RAISE EXCEPTION 'android profile migration requires non-empty store_account_name values';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "ios_store_mappings"
    WHERE NULLIF(BTRIM("store_account_name"), '') IS NULL
  ) OR EXISTS (
    SELECT 1
    FROM "ios_credentials"
    WHERE NULLIF(BTRIM("store_account_name"), '') IS NULL
  ) THEN
    RAISE EXCEPTION 'ios profile migration requires non-empty store_account_name values';
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

CREATE TABLE "android_store_profiles" (
  "id" UUID NOT NULL,
  "store_account_name" TEXT NOT NULL,
  "link_store" TEXT,
  "avatar_url" TEXT,
  "status" "mapping_status" NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "android_store_profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ios_store_profiles" (
  "id" UUID NOT NULL,
  "store_account_name" TEXT NOT NULL,
  "link_store" TEXT,
  "avatar_url" TEXT,
  "issuer_id" TEXT,
  "status" "mapping_status" NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ios_store_profiles_pkey" PRIMARY KEY ("id")
);

INSERT INTO "android_store_profiles" (
  "id",
  "store_account_name",
  "link_store",
  "avatar_url",
  "status",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid(),
  source."store_account_name",
  MAX(source."link_store"),
  MAX(source."avatar_url"),
  'active'::"mapping_status",
  MIN(source."created_at"),
  MAX(source."updated_at")
FROM (
  SELECT
    "store_account_name",
    NULL::TEXT AS "link_store",
    NULL::TEXT AS "avatar_url",
    "created_at",
    "updated_at"
  FROM "android_store_mappings"
  UNION ALL
  SELECT
    "store_account_name",
    "link_store",
    "avatar_url",
    "created_at",
    "updated_at"
  FROM "android_credentials"
) AS source
GROUP BY source."store_account_name";

INSERT INTO "ios_store_profiles" (
  "id",
  "store_account_name",
  "link_store",
  "avatar_url",
  "issuer_id",
  "status",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid(),
  source."store_account_name",
  MAX(source."link_store"),
  MAX(source."avatar_url"),
  MAX(source."issuer_id"),
  'active'::"mapping_status",
  MIN(source."created_at"),
  MAX(source."updated_at")
FROM (
  SELECT
    "store_account_name",
    NULL::TEXT AS "link_store",
    NULL::TEXT AS "avatar_url",
    NULL::TEXT AS "issuer_id",
    "created_at",
    "updated_at"
  FROM "ios_store_mappings"
  UNION ALL
  SELECT
    "store_account_name",
    "link_store",
    "avatar_url",
    "issuer_id",
    "created_at",
    "updated_at"
  FROM "ios_credentials"
) AS source
GROUP BY source."store_account_name";

CREATE UNIQUE INDEX "android_store_profiles_store_account_name_key"
  ON "android_store_profiles"("store_account_name");

CREATE INDEX "android_store_profiles_status_name_idx"
  ON "android_store_profiles"("status", "store_account_name");

CREATE UNIQUE INDEX "ios_store_profiles_store_account_name_key"
  ON "ios_store_profiles"("store_account_name");

CREATE INDEX "ios_store_profiles_status_name_idx"
  ON "ios_store_profiles"("status", "store_account_name");

ALTER TABLE "android_store_mappings"
  ADD COLUMN "store_profile_id" UUID;

ALTER TABLE "ios_store_mappings"
  ADD COLUMN "store_profile_id" UUID;

ALTER TABLE "android_credentials"
  ADD COLUMN "store_profile_id" UUID;

ALTER TABLE "ios_credentials"
  ADD COLUMN "store_profile_id" UUID;

UPDATE "android_store_mappings" AS mapping
SET "store_profile_id" = profile."id"
FROM "android_store_profiles" AS profile
WHERE profile."store_account_name" = mapping."store_account_name";

UPDATE "ios_store_mappings" AS mapping
SET "store_profile_id" = profile."id"
FROM "ios_store_profiles" AS profile
WHERE profile."store_account_name" = mapping."store_account_name";

UPDATE "android_credentials" AS credential
SET "store_profile_id" = profile."id"
FROM "android_store_profiles" AS profile
WHERE profile."store_account_name" = credential."store_account_name";

UPDATE "ios_credentials" AS credential
SET "store_profile_id" = profile."id"
FROM "ios_store_profiles" AS profile
WHERE profile."store_account_name" = credential."store_account_name";

ALTER TABLE "android_store_mappings"
  ALTER COLUMN "store_profile_id" SET NOT NULL;

ALTER TABLE "ios_store_mappings"
  ALTER COLUMN "store_profile_id" SET NOT NULL;

ALTER TABLE "android_credentials"
  ALTER COLUMN "store_profile_id" SET NOT NULL;

ALTER TABLE "ios_credentials"
  ALTER COLUMN "store_profile_id" SET NOT NULL;

DROP INDEX IF EXISTS "android_store_mappings_account_app_name_key";
DROP INDEX IF EXISTS "ios_store_mappings_account_app_name_key";
DROP INDEX IF EXISTS "android_credentials_store_purpose_key";
DROP INDEX IF EXISTS "ios_credentials_store_purpose_key";
DROP INDEX IF EXISTS "android_store_mappings_account_app_idx";
DROP INDEX IF EXISTS "ios_store_mappings_account_app_idx";

CREATE UNIQUE INDEX "android_store_mappings_profile_app_name_key"
  ON "android_store_mappings"("store_profile_id", "app_name");

CREATE UNIQUE INDEX "ios_store_mappings_profile_app_name_key"
  ON "ios_store_mappings"("store_profile_id", "app_name");

CREATE UNIQUE INDEX "android_credentials_profile_purpose_key"
  ON "android_credentials"("store_profile_id", "credential_purpose");

CREATE UNIQUE INDEX "ios_credentials_profile_purpose_key"
  ON "ios_credentials"("store_profile_id", "credential_purpose");

CREATE INDEX "android_store_mappings_store_name_idx"
  ON "android_store_mappings"("store_account_name");

CREATE INDEX "ios_store_mappings_store_name_idx"
  ON "ios_store_mappings"("store_account_name");

ALTER TABLE "android_store_mappings"
  ADD CONSTRAINT "android_store_mappings_store_profile_id_fkey"
  FOREIGN KEY ("store_profile_id") REFERENCES "android_store_profiles"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ios_store_mappings"
  ADD CONSTRAINT "ios_store_mappings_store_profile_id_fkey"
  FOREIGN KEY ("store_profile_id") REFERENCES "ios_store_profiles"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "android_credentials"
  ADD CONSTRAINT "android_credentials_store_profile_id_fkey"
  FOREIGN KEY ("store_profile_id") REFERENCES "android_store_profiles"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ios_credentials"
  ADD CONSTRAINT "ios_credentials_store_profile_id_fkey"
  FOREIGN KEY ("store_profile_id") REFERENCES "ios_store_profiles"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
