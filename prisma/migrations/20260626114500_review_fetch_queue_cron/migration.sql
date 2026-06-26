-- Convert review fetch runs from a pure execution log into a queue + log table.
ALTER TABLE "android_store_review_fetch_runs"
ADD COLUMN IF NOT EXISTS "source_schedule_id" UUID,
ADD COLUMN IF NOT EXISTS "scheduled_for" TIMESTAMPTZ(6),
ADD COLUMN IF NOT EXISTS "next_attempt_at" TIMESTAMPTZ(6),
ADD COLUMN IF NOT EXISTS "attempt_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "max_attempts" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN IF NOT EXISTS "locked_at" TIMESTAMPTZ(6),
ADD COLUMN IF NOT EXISTS "locked_by" TEXT;

UPDATE "android_store_review_fetch_runs"
SET "attempt_count" = 1
WHERE "attempt_count" = 0
  AND "status" <> 'pending';

ALTER TABLE "android_store_review_fetch_runs"
ALTER COLUMN "status" SET DEFAULT 'pending',
ALTER COLUMN "started_at" DROP DEFAULT,
ALTER COLUMN "started_at" DROP NOT NULL;

ALTER TABLE "android_store_review_fetch_runs"
DROP COLUMN IF EXISTS "max_pages";

DROP INDEX IF EXISTS "android_store_review_fetch_runs_mapping_started_idx";
DROP INDEX IF EXISTS "android_store_review_fetch_runs_status_started_idx";

CREATE UNIQUE INDEX IF NOT EXISTS "android_store_review_fetch_runs_mapping_trigger_scheduled_key"
ON "android_store_review_fetch_runs"("store_mapping_id", "trigger_type", "scheduled_for");

CREATE INDEX IF NOT EXISTS "android_store_review_fetch_runs_status_next_attempt_idx"
ON "android_store_review_fetch_runs"("status", "next_attempt_at");

CREATE INDEX IF NOT EXISTS "android_store_review_fetch_runs_status_locked_idx"
ON "android_store_review_fetch_runs"("status", "locked_at");

CREATE INDEX IF NOT EXISTS "android_store_review_fetch_runs_mapping_created_idx"
ON "android_store_review_fetch_runs"("store_mapping_id", "created_at");

CREATE INDEX IF NOT EXISTS "android_store_review_fetch_runs_schedule_for_idx"
ON "android_store_review_fetch_runs"("source_schedule_id", "scheduled_for");

CREATE INDEX IF NOT EXISTS "android_store_review_fetch_runs_created_idx"
ON "android_store_review_fetch_runs"("created_at");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'android_store_review_fetch_runs_source_schedule_id_fkey'
  ) THEN
    ALTER TABLE "android_store_review_fetch_runs"
    ADD CONSTRAINT "android_store_review_fetch_runs_source_schedule_id_fkey"
    FOREIGN KEY ("source_schedule_id")
    REFERENCES "android_store_review_fetch_schedules"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
  END IF;
END $$;

-- Keep schedules as durable daily config only. Per-run options live on fetch runs.
ALTER TABLE "android_store_review_fetch_schedules"
ADD COLUMN IF NOT EXISTS "last_error_code" TEXT;

ALTER TABLE "android_store_review_fetch_schedules"
DROP COLUMN IF EXISTS "lookback_days",
DROP COLUMN IF EXISTS "max_results",
DROP COLUMN IF EXISTS "max_pages";

-- Store profiles are no longer linked to Supabase Auth accounts.
DROP INDEX IF EXISTS "android_store_profiles_supabase_user_id_key";
ALTER TABLE "android_store_profiles"
DROP COLUMN IF EXISTS "supabase_user_id";

DROP INDEX IF EXISTS "ios_store_profiles_supabase_user_id_key";
ALTER TABLE "ios_store_profiles"
DROP COLUMN IF EXISTS "supabase_user_id";

-- Direct mobile verification inserts should be able to omit iOS transaction ids.
ALTER TABLE "ios_iap_transactions"
ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
