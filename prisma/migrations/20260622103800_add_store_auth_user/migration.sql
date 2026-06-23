-- AlterTable: add supabase_user_id to android_store_profiles
-- Links each store profile to a Supabase Auth user (1 store = 1 account)

ALTER TABLE "android_store_profiles"
  ADD COLUMN "supabase_user_id" UUID;

CREATE UNIQUE INDEX "android_store_profiles_supabase_user_id_key"
  ON "android_store_profiles"("supabase_user_id");
