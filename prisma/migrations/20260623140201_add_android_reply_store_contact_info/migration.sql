ALTER TABLE "android_store_profiles"
  ADD COLUMN IF NOT EXISTS "contact_email" TEXT,
  ADD COLUMN IF NOT EXISTS "support_phone" TEXT,
  ADD COLUMN IF NOT EXISTS "website_url" TEXT;
