-- Switch Android review fetch schedules from fixed daily time to interval hours.
ALTER TABLE "android_store_review_fetch_schedules"
ADD COLUMN IF NOT EXISTS "interval_hours" INTEGER NOT NULL DEFAULT 8;

UPDATE "android_store_review_fetch_schedules"
SET "interval_hours" = 8
WHERE "interval_hours" IS NULL;

ALTER TABLE "android_store_review_fetch_schedules"
DROP COLUMN IF EXISTS "schedule_type",
DROP COLUMN IF EXISTS "time_of_day",
DROP COLUMN IF EXISTS "timezone";
