-- Harden Supabase Data API access after console authentication is available.
-- Only Supabase Auth users with server-managed app_metadata role Admin may access
-- the migrated console, store mapping, and key management tables directly.

DROP POLICY IF EXISTS "android_store_accounts_staff_access" ON "android_store_accounts";
DROP POLICY IF EXISTS "ios_store_accounts_staff_access" ON "ios_store_accounts";
DROP POLICY IF EXISTS "android_store_mappings_product_scope_access" ON "android_store_mappings";
DROP POLICY IF EXISTS "ios_store_mappings_product_scope_access" ON "ios_store_mappings";
DROP POLICY IF EXISTS "android_credentials_product_scope_access" ON "android_credentials";
DROP POLICY IF EXISTS "ios_credentials_product_scope_access" ON "ios_credentials";
DROP POLICY IF EXISTS "android_preflight_product_scope_access" ON "android_credential_preflight_checks";
DROP POLICY IF EXISTS "ios_preflight_product_scope_access" ON "ios_credential_preflight_checks";

DROP POLICY IF EXISTS "android_store_accounts_admin_only" ON "android_store_accounts";
DROP POLICY IF EXISTS "ios_store_accounts_admin_only" ON "ios_store_accounts";
DROP POLICY IF EXISTS "android_store_mappings_admin_only" ON "android_store_mappings";
DROP POLICY IF EXISTS "ios_store_mappings_admin_only" ON "ios_store_mappings";
DROP POLICY IF EXISTS "android_credentials_admin_only" ON "android_credentials";
DROP POLICY IF EXISTS "ios_credentials_admin_only" ON "ios_credentials";
DROP POLICY IF EXISTS "android_preflight_admin_only" ON "android_credential_preflight_checks";
DROP POLICY IF EXISTS "ios_preflight_admin_only" ON "ios_credential_preflight_checks";
DROP POLICY IF EXISTS "team_members_admin_only" ON "team_members";
DROP POLICY IF EXISTS "console_audit_logs_admin_only" ON "console_audit_logs";

DROP FUNCTION IF EXISTS "public"."can_access_product"(TEXT);
DROP FUNCTION IF EXISTS "public"."current_app_scope"();
DROP FUNCTION IF EXISTS "public"."current_staff_role"();

CREATE OR REPLACE FUNCTION "public"."is_console_admin"()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  SELECT lower(
    COALESCE(
      auth.jwt() -> 'app_metadata' ->> 'role',
      auth.jwt() -> 'app_metadata' ->> 'staff_role',
      auth.jwt() -> 'app_metadata' ->> 'console_role',
      ''
    )
  ) = 'admin';
$$;

REVOKE ALL ON FUNCTION "public"."is_console_admin"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."is_console_admin"() TO authenticated;

ALTER TABLE "android_store_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ios_store_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "android_store_mappings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ios_store_mappings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "android_credentials" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ios_credentials" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "android_credential_preflight_checks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ios_credential_preflight_checks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "team_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "console_audit_logs" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  "android_store_accounts",
  "ios_store_accounts",
  "android_store_mappings",
  "ios_store_mappings",
  "android_credentials",
  "ios_credentials",
  "android_credential_preflight_checks",
  "ios_credential_preflight_checks",
  "team_members",
  "console_audit_logs"
FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  "android_store_accounts",
  "ios_store_accounts",
  "android_store_mappings",
  "ios_store_mappings",
  "android_credentials",
  "ios_credentials",
  "android_credential_preflight_checks",
  "ios_credential_preflight_checks",
  "team_members",
  "console_audit_logs"
TO authenticated;

CREATE POLICY "android_store_accounts_admin_only"
ON "android_store_accounts"
FOR ALL
TO authenticated
USING ("public"."is_console_admin"())
WITH CHECK ("public"."is_console_admin"());

CREATE POLICY "ios_store_accounts_admin_only"
ON "ios_store_accounts"
FOR ALL
TO authenticated
USING ("public"."is_console_admin"())
WITH CHECK ("public"."is_console_admin"());

CREATE POLICY "android_store_mappings_admin_only"
ON "android_store_mappings"
FOR ALL
TO authenticated
USING ("public"."is_console_admin"())
WITH CHECK ("public"."is_console_admin"());

CREATE POLICY "ios_store_mappings_admin_only"
ON "ios_store_mappings"
FOR ALL
TO authenticated
USING ("public"."is_console_admin"())
WITH CHECK ("public"."is_console_admin"());

CREATE POLICY "android_credentials_admin_only"
ON "android_credentials"
FOR ALL
TO authenticated
USING ("public"."is_console_admin"())
WITH CHECK ("public"."is_console_admin"());

CREATE POLICY "ios_credentials_admin_only"
ON "ios_credentials"
FOR ALL
TO authenticated
USING ("public"."is_console_admin"())
WITH CHECK ("public"."is_console_admin"());

CREATE POLICY "android_preflight_admin_only"
ON "android_credential_preflight_checks"
FOR ALL
TO authenticated
USING ("public"."is_console_admin"())
WITH CHECK ("public"."is_console_admin"());

CREATE POLICY "ios_preflight_admin_only"
ON "ios_credential_preflight_checks"
FOR ALL
TO authenticated
USING ("public"."is_console_admin"())
WITH CHECK ("public"."is_console_admin"());

CREATE POLICY "team_members_admin_only"
ON "team_members"
FOR ALL
TO authenticated
USING ("public"."is_console_admin"())
WITH CHECK ("public"."is_console_admin"());

CREATE POLICY "console_audit_logs_admin_only"
ON "console_audit_logs"
FOR ALL
TO authenticated
USING ("public"."is_console_admin"())
WITH CHECK ("public"."is_console_admin"());
