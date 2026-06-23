-- Move provider credential payloads out of app tables and into Supabase Vault.
-- App tables keep only metadata and a Vault pointer. Plaintext never belongs in
-- public schema tables.
--
-- Supabase Vault is a managed extension in schema "vault". Do not create,
-- revoke, or grant extension-owned functions in this Prisma migration because
-- the application DB user may not own Vault/pgsodium internals. Enable Vault in
-- Supabase before deploying this migration.

ALTER TABLE "android_credentials"
  ADD COLUMN IF NOT EXISTS "vault_secret_id" UUID,
  ADD COLUMN IF NOT EXISTS "vault_secret_name" TEXT,
  ADD COLUMN IF NOT EXISTS "vault_secret_version" INTEGER NOT NULL DEFAULT 1,
  DROP COLUMN IF EXISTS "encrypted_secret_payload";

ALTER TABLE "ios_credentials"
  ADD COLUMN IF NOT EXISTS "vault_secret_id" UUID,
  ADD COLUMN IF NOT EXISTS "vault_secret_name" TEXT,
  ADD COLUMN IF NOT EXISTS "vault_secret_version" INTEGER NOT NULL DEFAULT 1,
  DROP COLUMN IF EXISTS "encrypted_secret_payload";

CREATE INDEX IF NOT EXISTS "android_credentials_vault_secret_id_idx"
ON "android_credentials"("vault_secret_id");

CREATE INDEX IF NOT EXISTS "android_credentials_vault_secret_name_idx"
ON "android_credentials"("vault_secret_name");

CREATE INDEX IF NOT EXISTS "ios_credentials_vault_secret_id_idx"
ON "ios_credentials"("vault_secret_id");

CREATE INDEX IF NOT EXISTS "ios_credentials_vault_secret_name_idx"
ON "ios_credentials"("vault_secret_name");
