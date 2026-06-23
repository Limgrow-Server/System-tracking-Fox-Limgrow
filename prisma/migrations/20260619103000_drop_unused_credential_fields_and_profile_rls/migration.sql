-- Remove unused credential metadata that has no runtime flow in the current scope.
ALTER TABLE "android_credentials" DROP COLUMN IF EXISTS "secret_fingerprint";
ALTER TABLE "android_credentials" DROP COLUMN IF EXISTS "expires_at";
ALTER TABLE "ios_credentials" DROP COLUMN IF EXISTS "secret_fingerprint";
ALTER TABLE "ios_credentials" DROP COLUMN IF EXISTS "expires_at";

-- Store profiles were introduced after the original admin-only RLS migration.
-- Keep them aligned with the rest of the console tables.
ALTER TABLE "android_store_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ios_store_profiles" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  "android_store_profiles",
  "ios_store_profiles"
FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  "android_store_profiles",
  "ios_store_profiles"
TO authenticated;

DROP POLICY IF EXISTS "android_store_profiles_admin_only" ON "android_store_profiles";
DROP POLICY IF EXISTS "ios_store_profiles_admin_only" ON "ios_store_profiles";

CREATE POLICY "android_store_profiles_admin_only"
ON "android_store_profiles"
FOR ALL
TO authenticated
USING ("public"."is_console_admin"())
WITH CHECK ("public"."is_console_admin"());

CREATE POLICY "ios_store_profiles_admin_only"
ON "ios_store_profiles"
FOR ALL
TO authenticated
USING ("public"."is_console_admin"())
WITH CHECK ("public"."is_console_admin"());
