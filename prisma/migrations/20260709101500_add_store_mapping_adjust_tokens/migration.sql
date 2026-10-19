ALTER TABLE "android_store_mappings"
ADD COLUMN IF NOT EXISTS "adjust_app_token" TEXT,
ADD COLUMN IF NOT EXISTS "adjust_event_token" TEXT;

ALTER TABLE "ios_store_mappings"
ADD COLUMN IF NOT EXISTS "adjust_app_token" TEXT,
ADD COLUMN IF NOT EXISTS "adjust_event_token" TEXT;
