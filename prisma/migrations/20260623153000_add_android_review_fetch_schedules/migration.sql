DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'review_fetch_schedule_status') THEN
    CREATE TYPE "review_fetch_schedule_status" AS ENUM ('active', 'paused');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "android_store_review_fetch_schedules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "store_mapping_id" UUID NOT NULL,
    "status" "review_fetch_schedule_status" NOT NULL DEFAULT 'active',
    "schedule_type" TEXT NOT NULL DEFAULT 'daily',
    "time_of_day" TEXT NOT NULL DEFAULT '09:00',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
    "lookback_days" INTEGER NOT NULL DEFAULT 7,
    "max_results" INTEGER NOT NULL DEFAULT 100,
    "max_pages" INTEGER NOT NULL DEFAULT 2,
    "next_run_at" TIMESTAMPTZ(6) NOT NULL,
    "last_run_at" TIMESTAMPTZ(6),
    "last_status" "review_fetch_run_status",
    "last_error_message" TEXT,
    "locked_at" TIMESTAMPTZ(6),
    "locked_by" TEXT,
    "run_count" INTEGER NOT NULL DEFAULT 0,
    "created_by" TEXT,
    "updated_by" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "android_store_review_fetch_schedules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "android_store_review_fetch_schedules_store_mapping_id_key"
    ON "android_store_review_fetch_schedules"("store_mapping_id");

CREATE INDEX IF NOT EXISTS "android_store_review_fetch_schedules_status_next_idx"
    ON "android_store_review_fetch_schedules"("status", "next_run_at");

CREATE INDEX IF NOT EXISTS "android_store_review_fetch_schedules_locked_idx"
    ON "android_store_review_fetch_schedules"("locked_at");

DO $$
BEGIN
  ALTER TABLE "android_store_review_fetch_schedules"
    ADD CONSTRAINT "android_store_review_fetch_schedules_store_mapping_id_fkey"
    FOREIGN KEY ("store_mapping_id")
    REFERENCES "android_store_mappings"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "android_store_review_fetch_schedules" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  "android_store_review_fetch_schedules"
FROM anon, authenticated;

GRANT ALL ON TABLE
  "android_store_review_fetch_schedules"
TO service_role;
