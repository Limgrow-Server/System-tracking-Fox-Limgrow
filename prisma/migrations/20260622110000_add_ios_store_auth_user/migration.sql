-- Link each iOS store profile to at most one Supabase Auth user.

-- Allow manually created console users to omit updated_at.
-- Prisma fills this field itself, but Supabase Table Editor and raw SQL do not.
ALTER TABLE "team_members"
  ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "ios_store_profiles"
  ADD COLUMN IF NOT EXISTS "supabase_user_id" UUID;

CREATE UNIQUE INDEX IF NOT EXISTS "ios_store_profiles_supabase_user_id_key"
  ON "ios_store_profiles"("supabase_user_id");

ALTER TABLE "ios_iap_transactions"
  ADD COLUMN IF NOT EXISTS "store_profile_id" UUID;

CREATE INDEX IF NOT EXISTS "ios_iap_transactions_store_profile_id_idx"
  ON "ios_iap_transactions"("store_profile_id");

DO $$
BEGIN
  ALTER TABLE "ios_iap_transactions"
    ADD CONSTRAINT "ios_iap_transactions_store_profile_id_fkey"
    FOREIGN KEY ("store_profile_id")
    REFERENCES "ios_store_profiles"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
