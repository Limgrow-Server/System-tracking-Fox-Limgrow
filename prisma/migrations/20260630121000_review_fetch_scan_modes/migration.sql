-- Track review fetch scan mode and stop reason so full scans and incremental
-- scheduled scans can share the same fetch-run queue.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'review_fetch_scan_mode') THEN
    CREATE TYPE "review_fetch_scan_mode" AS ENUM ('limited', 'incremental', 'full');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'review_fetch_stop_reason') THEN
    CREATE TYPE "review_fetch_stop_reason" AS ENUM (
      'completed',
      'early_stop_known_page',
      'date_range_boundary',
      'page_limit_reached',
      'quota_guard',
      'empty_page'
    );
  END IF;
END $$;

ALTER TABLE "android_store_review_fetch_runs"
ADD COLUMN IF NOT EXISTS "scan_mode" "review_fetch_scan_mode" NOT NULL DEFAULT 'limited',
ADD COLUMN IF NOT EXISTS "stop_reason" "review_fetch_stop_reason",
ADD COLUMN IF NOT EXISTS "request_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "next_page_token" TEXT;

CREATE INDEX IF NOT EXISTS "android_store_review_fetch_runs_scan_status_idx"
ON "android_store_review_fetch_runs" ("scan_mode", "status");
