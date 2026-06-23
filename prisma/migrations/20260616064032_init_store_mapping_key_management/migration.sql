-- CreateEnum
CREATE TYPE "account_status" AS ENUM ('active', 'inactive', 'suspended');

-- CreateEnum
CREATE TYPE "mapping_status" AS ENUM ('active', 'inactive', 'archived');

-- CreateEnum
CREATE TYPE "credential_status" AS ENUM ('pending', 'ready', 'failed', 'suspect', 'disabled');

-- CreateEnum
CREATE TYPE "secret_lifecycle_status" AS ENUM ('active', 'rotating', 'disabled', 'expired');

-- CreateEnum
CREATE TYPE "preflight_result" AS ENUM ('passed', 'failed');

-- CreateEnum
CREATE TYPE "android_secret_type" AS ENUM ('google_play_service_account', 'firebase_service_account', 'generic_json');

-- CreateEnum
CREATE TYPE "ios_secret_type" AS ENUM ('apple_asc_p8', 'apple_iap_p8', 'apns_auth_key', 'firebase_service_account', 'generic_text');

-- CreateEnum
CREATE TYPE "secret_format" AS ENUM ('json', 'p8', 'text');

-- CreateEnum
CREATE TYPE "android_preflight_module" AS ENUM ('firebase_fcm', 'google_play_api');

-- CreateEnum
CREATE TYPE "ios_preflight_module" AS ENUM ('firebase_fcm', 'app_store_connect', 'app_store_server_api', 'apns');

-- CreateEnum
CREATE TYPE "apple_push_environment" AS ENUM ('sandbox', 'production');

-- CreateTable
CREATE TABLE "android_store_accounts" (
    "id" UUID NOT NULL,
    "account_name" TEXT NOT NULL,
    "developer_account_id" TEXT,
    "status" "account_status" NOT NULL DEFAULT 'active',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "android_store_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ios_store_accounts" (
    "id" UUID NOT NULL,
    "account_name" TEXT NOT NULL,
    "apple_team_id" TEXT,
    "status" "account_status" NOT NULL DEFAULT 'active',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ios_store_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "android_store_mappings" (
    "id" UUID NOT NULL,
    "store_account_id" UUID,
    "store_account_name" TEXT NOT NULL,
    "product_app_id" TEXT NOT NULL,
    "environment" TEXT NOT NULL DEFAULT 'production',
    "package_name" TEXT NOT NULL,
    "firebase_project_id" TEXT,
    "firebase_project_number" TEXT,
    "firebase_app_id" TEXT,
    "firebase_sender_id" TEXT,
    "firebase_credential_ref" TEXT,
    "firebase_service_account_email" TEXT,
    "fcm_api_enabled" BOOLEAN NOT NULL DEFAULT false,
    "google_play_developer_id" TEXT,
    "google_play_credential_ref" TEXT,
    "google_service_account_email" TEXT,
    "google_credential_capabilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "google_play_api_enabled" BOOLEAN NOT NULL DEFAULT false,
    "google_play_permissions_status" TEXT,
    "credential_status" "credential_status" NOT NULL DEFAULT 'pending',
    "last_preflight_at" TIMESTAMPTZ(6),
    "last_preflight_result" "preflight_result",
    "last_preflight_error_code" TEXT,
    "last_successful_operation_at" TIMESTAMPTZ(6),
    "status" "mapping_status" NOT NULL DEFAULT 'active',
    "scan_enabled" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "android_store_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ios_store_mappings" (
    "id" UUID NOT NULL,
    "store_account_id" UUID,
    "store_account_name" TEXT NOT NULL,
    "product_app_id" TEXT NOT NULL,
    "environment" TEXT NOT NULL DEFAULT 'production',
    "bundle_id" TEXT NOT NULL,
    "apple_app_id" TEXT,
    "apple_team_id" TEXT,
    "apple_asc_issuer_id" TEXT,
    "apple_asc_key_id" TEXT,
    "apple_asc_credential_ref" TEXT,
    "apple_iap_issuer_id" TEXT,
    "apple_iap_key_id" TEXT,
    "apple_iap_credential_ref" TEXT,
    "apns_key_id" TEXT,
    "apns_credential_ref" TEXT,
    "apns_environment" "apple_push_environment" NOT NULL DEFAULT 'production',
    "apns_config_status" TEXT,
    "firebase_project_id" TEXT,
    "firebase_project_number" TEXT,
    "firebase_app_id" TEXT,
    "firebase_sender_id" TEXT,
    "firebase_credential_ref" TEXT,
    "firebase_service_account_email" TEXT,
    "fcm_api_enabled" BOOLEAN NOT NULL DEFAULT false,
    "credential_status" "credential_status" NOT NULL DEFAULT 'pending',
    "last_preflight_at" TIMESTAMPTZ(6),
    "last_preflight_result" "preflight_result",
    "last_preflight_error_code" TEXT,
    "last_successful_operation_at" TIMESTAMPTZ(6),
    "status" "mapping_status" NOT NULL DEFAULT 'active',
    "scan_enabled" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ios_store_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "android_credentials" (
    "id" UUID NOT NULL,
    "android_store_mapping_id" UUID,
    "credential_ref" TEXT NOT NULL,
    "secret_type" "android_secret_type" NOT NULL,
    "secret_format" "secret_format" NOT NULL DEFAULT 'json',
    "encrypted_secret_payload" JSONB NOT NULL,
    "secret_fingerprint" TEXT,
    "key_encryption_version" INTEGER NOT NULL DEFAULT 1,
    "store_account_name" TEXT,
    "product_app_id" TEXT,
    "environment" TEXT NOT NULL DEFAULT 'production',
    "package_name" TEXT,
    "private_key_id" TEXT,
    "client_email" TEXT,
    "project_id" TEXT,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "capabilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "secret_lifecycle_status" NOT NULL DEFAULT 'active',
    "description" TEXT,
    "created_by" TEXT,
    "rotated_by" TEXT,
    "last_used_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "android_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ios_credentials" (
    "id" UUID NOT NULL,
    "ios_store_mapping_id" UUID,
    "credential_ref" TEXT NOT NULL,
    "secret_type" "ios_secret_type" NOT NULL,
    "secret_format" "secret_format" NOT NULL DEFAULT 'p8',
    "encrypted_secret_payload" JSONB NOT NULL,
    "secret_fingerprint" TEXT,
    "key_encryption_version" INTEGER NOT NULL DEFAULT 1,
    "store_account_name" TEXT,
    "product_app_id" TEXT,
    "environment" TEXT NOT NULL DEFAULT 'production',
    "bundle_id" TEXT,
    "key_id" TEXT,
    "issuer_id" TEXT,
    "team_id" TEXT,
    "client_email" TEXT,
    "project_id" TEXT,
    "capabilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "secret_lifecycle_status" NOT NULL DEFAULT 'active',
    "description" TEXT,
    "created_by" TEXT,
    "rotated_by" TEXT,
    "last_used_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ios_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "android_credential_preflight_checks" (
    "id" UUID NOT NULL,
    "android_store_mapping_id" UUID,
    "credential_ref" TEXT NOT NULL,
    "module_name" "android_preflight_module" NOT NULL,
    "result" "preflight_result" NOT NULL,
    "error_code" TEXT,
    "error_detail" TEXT,
    "provider_request_id" TEXT,
    "duration_ms" INTEGER,
    "checked_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "android_credential_preflight_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ios_credential_preflight_checks" (
    "id" UUID NOT NULL,
    "ios_store_mapping_id" UUID,
    "credential_ref" TEXT NOT NULL,
    "module_name" "ios_preflight_module" NOT NULL,
    "result" "preflight_result" NOT NULL,
    "error_code" TEXT,
    "error_detail" TEXT,
    "provider_request_id" TEXT,
    "duration_ms" INTEGER,
    "checked_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ios_credential_preflight_checks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "android_store_accounts_account_name_key" ON "android_store_accounts"("account_name");

-- CreateIndex
CREATE UNIQUE INDEX "ios_store_accounts_account_name_key" ON "ios_store_accounts"("account_name");

-- CreateIndex
CREATE INDEX "android_store_mappings_package_status_idx" ON "android_store_mappings"("package_name", "environment", "status");

-- CreateIndex
CREATE INDEX "android_store_mappings_account_app_idx" ON "android_store_mappings"("store_account_name", "product_app_id");

-- CreateIndex
CREATE UNIQUE INDEX "android_store_mappings_account_app_env_key" ON "android_store_mappings"("store_account_name", "product_app_id", "environment");

-- CreateIndex
CREATE UNIQUE INDEX "android_store_mappings_package_env_key" ON "android_store_mappings"("package_name", "environment");

-- CreateIndex
CREATE INDEX "ios_store_mappings_bundle_status_idx" ON "ios_store_mappings"("bundle_id", "environment", "status");

-- CreateIndex
CREATE INDEX "ios_store_mappings_account_app_idx" ON "ios_store_mappings"("store_account_name", "product_app_id");

-- CreateIndex
CREATE UNIQUE INDEX "ios_store_mappings_account_app_env_key" ON "ios_store_mappings"("store_account_name", "product_app_id", "environment");

-- CreateIndex
CREATE UNIQUE INDEX "ios_store_mappings_bundle_env_key" ON "ios_store_mappings"("bundle_id", "environment");

-- CreateIndex
CREATE UNIQUE INDEX "android_credentials_credential_ref_key" ON "android_credentials"("credential_ref");

-- CreateIndex
CREATE INDEX "android_credentials_lookup_idx" ON "android_credentials"("credential_ref", "status");

-- CreateIndex
CREATE INDEX "android_credentials_mapping_idx" ON "android_credentials"("android_store_mapping_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ios_credentials_credential_ref_key" ON "ios_credentials"("credential_ref");

-- CreateIndex
CREATE INDEX "ios_credentials_lookup_idx" ON "ios_credentials"("credential_ref", "status");

-- CreateIndex
CREATE INDEX "ios_credentials_mapping_idx" ON "ios_credentials"("ios_store_mapping_id", "status");

-- CreateIndex
CREATE INDEX "android_preflight_latest_idx" ON "android_credential_preflight_checks"("credential_ref", "module_name", "checked_at");

-- CreateIndex
CREATE INDEX "ios_preflight_latest_idx" ON "ios_credential_preflight_checks"("credential_ref", "module_name", "checked_at");

-- AddForeignKey
ALTER TABLE "android_store_mappings" ADD CONSTRAINT "android_store_mappings_store_account_id_fkey" FOREIGN KEY ("store_account_id") REFERENCES "android_store_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ios_store_mappings" ADD CONSTRAINT "ios_store_mappings_store_account_id_fkey" FOREIGN KEY ("store_account_id") REFERENCES "ios_store_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "android_credentials" ADD CONSTRAINT "android_credentials_android_store_mapping_id_fkey" FOREIGN KEY ("android_store_mapping_id") REFERENCES "android_store_mappings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ios_credentials" ADD CONSTRAINT "ios_credentials_ios_store_mapping_id_fkey" FOREIGN KEY ("ios_store_mapping_id") REFERENCES "ios_store_mappings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "android_credential_preflight_checks" ADD CONSTRAINT "android_credential_preflight_checks_android_store_mapping__fkey" FOREIGN KEY ("android_store_mapping_id") REFERENCES "android_store_mappings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ios_credential_preflight_checks" ADD CONSTRAINT "ios_credential_preflight_checks_ios_store_mapping_id_fkey" FOREIGN KEY ("ios_store_mapping_id") REFERENCES "ios_store_mappings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Enable RLS for Supabase Data API access.
-- These policies expect Supabase Auth JWT app_metadata to include:
--   role: "Admin" | "Dev"
--   app_scope: ["*"] or ["PRODUCT_APP_ID", ...]
-- Server-side Prisma APIs still enforce RBAC in application code and should keep using
-- server-only DATABASE_URL credentials.

CREATE OR REPLACE FUNCTION "public"."current_staff_role"()
RETURNS TEXT
LANGUAGE SQL
STABLE
AS $$
  SELECT lower(
    COALESCE(
      auth.jwt() -> 'app_metadata' ->> 'role',
      auth.jwt() -> 'app_metadata' ->> 'staff_role',
      auth.jwt() -> 'app_metadata' ->> 'user_role',
      ''
    )
  );
$$;

CREATE OR REPLACE FUNCTION "public"."current_app_scope"()
RETURNS TEXT[]
LANGUAGE SQL
STABLE
AS $$
  SELECT COALESCE(
    ARRAY(
      SELECT jsonb_array_elements_text(
        COALESCE(auth.jwt() -> 'app_metadata' -> 'app_scope', '[]'::jsonb)
      )
    ),
    ARRAY[]::TEXT[]
  );
$$;

CREATE OR REPLACE FUNCTION "public"."can_access_product"("target_product_app_id" TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  SELECT
    "public"."current_staff_role"() = 'admin'
    OR (
      "public"."current_staff_role"() = 'dev'
      AND "target_product_app_id" IS NOT NULL
      AND (
        '*' = ANY("public"."current_app_scope"())
        OR "target_product_app_id" = ANY("public"."current_app_scope"())
      )
    );
$$;

REVOKE ALL ON FUNCTION "public"."current_staff_role"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."current_app_scope"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."can_access_product"(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."current_staff_role"() TO authenticated;
GRANT EXECUTE ON FUNCTION "public"."current_app_scope"() TO authenticated;
GRANT EXECUTE ON FUNCTION "public"."can_access_product"(TEXT) TO authenticated;

ALTER TABLE "android_store_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ios_store_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "android_store_mappings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ios_store_mappings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "android_credentials" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ios_credentials" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "android_credential_preflight_checks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ios_credential_preflight_checks" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  "android_store_accounts",
  "ios_store_accounts",
  "android_store_mappings",
  "ios_store_mappings",
  "android_credentials",
  "ios_credentials",
  "android_credential_preflight_checks",
  "ios_credential_preflight_checks"
FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  "android_store_accounts",
  "ios_store_accounts",
  "android_store_mappings",
  "ios_store_mappings",
  "android_credentials",
  "ios_credentials",
  "android_credential_preflight_checks",
  "ios_credential_preflight_checks"
TO authenticated;

CREATE POLICY "android_store_accounts_staff_access"
ON "android_store_accounts"
FOR ALL
TO authenticated
USING ("public"."current_staff_role"() IN ('admin', 'dev'))
WITH CHECK ("public"."current_staff_role"() IN ('admin', 'dev'));

CREATE POLICY "ios_store_accounts_staff_access"
ON "ios_store_accounts"
FOR ALL
TO authenticated
USING ("public"."current_staff_role"() IN ('admin', 'dev'))
WITH CHECK ("public"."current_staff_role"() IN ('admin', 'dev'));

CREATE POLICY "android_store_mappings_product_scope_access"
ON "android_store_mappings"
FOR ALL
TO authenticated
USING ("public"."can_access_product"("product_app_id"))
WITH CHECK ("public"."can_access_product"("product_app_id"));

CREATE POLICY "ios_store_mappings_product_scope_access"
ON "ios_store_mappings"
FOR ALL
TO authenticated
USING ("public"."can_access_product"("product_app_id"))
WITH CHECK ("public"."can_access_product"("product_app_id"));

CREATE POLICY "android_credentials_product_scope_access"
ON "android_credentials"
FOR ALL
TO authenticated
USING ("public"."can_access_product"("product_app_id"))
WITH CHECK ("public"."can_access_product"("product_app_id"));

CREATE POLICY "ios_credentials_product_scope_access"
ON "ios_credentials"
FOR ALL
TO authenticated
USING ("public"."can_access_product"("product_app_id"))
WITH CHECK ("public"."can_access_product"("product_app_id"));

CREATE POLICY "android_preflight_product_scope_access"
ON "android_credential_preflight_checks"
FOR ALL
TO authenticated
USING (
  "public"."current_staff_role"() = 'admin'
  OR EXISTS (
    SELECT 1
    FROM "android_store_mappings"
    WHERE "android_store_mappings"."id" = "android_credential_preflight_checks"."android_store_mapping_id"
      AND "public"."can_access_product"("android_store_mappings"."product_app_id")
  )
)
WITH CHECK (
  "public"."current_staff_role"() = 'admin'
  OR EXISTS (
    SELECT 1
    FROM "android_store_mappings"
    WHERE "android_store_mappings"."id" = "android_credential_preflight_checks"."android_store_mapping_id"
      AND "public"."can_access_product"("android_store_mappings"."product_app_id")
  )
);

CREATE POLICY "ios_preflight_product_scope_access"
ON "ios_credential_preflight_checks"
FOR ALL
TO authenticated
USING (
  "public"."current_staff_role"() = 'admin'
  OR EXISTS (
    SELECT 1
    FROM "ios_store_mappings"
    WHERE "ios_store_mappings"."id" = "ios_credential_preflight_checks"."ios_store_mapping_id"
      AND "public"."can_access_product"("ios_store_mappings"."product_app_id")
  )
)
WITH CHECK (
  "public"."current_staff_role"() = 'admin'
  OR EXISTS (
    SELECT 1
    FROM "ios_store_mappings"
    WHERE "ios_store_mappings"."id" = "ios_credential_preflight_checks"."ios_store_mapping_id"
      AND "public"."can_access_product"("ios_store_mappings"."product_app_id")
  )
);
