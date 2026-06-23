ALTER TABLE "android_store_mappings"
ADD COLUMN IF NOT EXISTS "app_id" TEXT;

ALTER TABLE "ios_store_mappings"
ADD COLUMN IF NOT EXISTS "app_id" TEXT;

ALTER TABLE "notification_jobs"
ADD COLUMN IF NOT EXISTS "app_id" TEXT;

ALTER TABLE "notification_schedules"
ADD COLUMN IF NOT EXISTS "app_id" TEXT;

UPDATE "android_store_mappings"
SET "app_id" = NULLIF(BTRIM("app_name"), '')
WHERE "app_id" IS NULL
  AND NULLIF(BTRIM("app_name"), '') IS NOT NULL;

UPDATE "ios_store_mappings"
SET "app_id" = NULLIF(BTRIM("app_name"), '')
WHERE "app_id" IS NULL
  AND NULLIF(BTRIM("app_name"), '') IS NOT NULL;

UPDATE "notification_jobs"
SET "app_id" = NULLIF(BTRIM("app_name"), '')
WHERE "app_id" IS NULL
  AND NULLIF(BTRIM("app_name"), '') IS NOT NULL;

UPDATE "notification_schedules"
SET "app_id" = NULLIF(BTRIM("app_name"), '')
WHERE "app_id" IS NULL
  AND NULLIF(BTRIM("app_name"), '') IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "android_store_mappings_profile_app_id_key"
ON "android_store_mappings"("store_profile_id", "app_id");

CREATE INDEX IF NOT EXISTS "android_store_mappings_app_id_status_idx"
ON "android_store_mappings"("app_id", "status");

CREATE UNIQUE INDEX IF NOT EXISTS "ios_store_mappings_profile_app_id_key"
ON "ios_store_mappings"("store_profile_id", "app_id");

CREATE INDEX IF NOT EXISTS "ios_store_mappings_app_id_status_idx"
ON "ios_store_mappings"("app_id", "status");

CREATE INDEX IF NOT EXISTS "notification_jobs_app_id_platform_created_idx"
ON "notification_jobs"("app_id", "platform", "created_at");

CREATE INDEX IF NOT EXISTS "notification_schedules_app_id_platform_created_idx"
ON "notification_schedules"("app_id", "platform", "created_at");
