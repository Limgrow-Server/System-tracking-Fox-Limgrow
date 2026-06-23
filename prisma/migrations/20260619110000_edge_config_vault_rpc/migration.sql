-- Allow Supabase Edge Functions using the service-role key to read the
-- plaintext value of a Vault secret by id without exposing the vault schema
-- through the Data API.

CREATE OR REPLACE FUNCTION "public"."system_tracking_get_vault_secret"("secret_id" UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = "public", "pg_temp"
AS $$
DECLARE
  "secret_value" TEXT;
BEGIN
  EXECUTE
    'select decrypted_secret::text from vault.decrypted_secrets where id = $1 limit 1'
  INTO "secret_value"
  USING "secret_id";

  IF "secret_value" IS NULL THEN
    RAISE EXCEPTION 'Vault secret was not found or could not be decrypted';
  END IF;

  RETURN "secret_value";
EXCEPTION
  WHEN invalid_schema_name OR undefined_table THEN
    RAISE EXCEPTION 'Supabase Vault extension is not enabled or vault.decrypted_secrets is unavailable';
END;
$$;

REVOKE ALL ON FUNCTION "public"."system_tracking_get_vault_secret"(UUID) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION "public"."system_tracking_get_vault_secret"(UUID) FROM anon;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION "public"."system_tracking_get_vault_secret"(UUID) FROM authenticated;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION "public"."system_tracking_get_vault_secret"(UUID) TO service_role;
  END IF;
END
$$;
