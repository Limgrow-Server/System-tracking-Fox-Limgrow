-- Keep the Play-provided obfuscated ID separate from the legacy account ID.
ALTER TABLE "iap_android"
  ADD COLUMN IF NOT EXISTS "obfuscated_external_account_id" TEXT;
