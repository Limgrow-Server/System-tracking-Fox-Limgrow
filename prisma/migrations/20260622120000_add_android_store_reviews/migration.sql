-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'review_sync_status') THEN
    CREATE TYPE "review_sync_status" AS ENUM ('idle', 'running', 'succeeded', 'failed');
  END IF;
END $$;

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'review_fetch_run_status') THEN
    CREATE TYPE "review_fetch_run_status" AS ENUM ('running', 'succeeded', 'failed', 'partial');
  END IF;
END $$;

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'review_fetch_trigger') THEN
    CREATE TYPE "review_fetch_trigger" AS ENUM ('scheduled', 'manual', 'retry');
  END IF;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "android_store_reviews" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "store_mapping_id" UUID NOT NULL,
    "review_id" TEXT NOT NULL,
    "author_name" TEXT,
    "rating" INTEGER,
    "review_text" TEXT,
    "original_text" TEXT,
    "reviewer_language" TEXT,
    "device" TEXT,
    "android_os_version" INTEGER,
    "app_version_code" INTEGER,
    "app_version_name" TEXT,
    "thumbs_up_count" INTEGER,
    "thumbs_down_count" INTEGER,
    "user_comment_updated_at" TIMESTAMPTZ(6),
    "developer_reply_text" TEXT,
    "developer_reply_updated_at" TIMESTAMPTZ(6),
    "raw_review" JSONB,
    "fetched_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "android_store_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "android_store_review_sync_states" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "store_mapping_id" UUID NOT NULL,
    "status" "review_sync_status" NOT NULL DEFAULT 'idle',
    "last_fetch_started_at" TIMESTAMPTZ(6),
    "last_fetch_finished_at" TIMESTAMPTZ(6),
    "last_success_at" TIMESTAMPTZ(6),
    "last_review_updated_at" TIMESTAMPTZ(6),
    "locked_at" TIMESTAMPTZ(6),
    "locked_by" TEXT,
    "last_error_code" TEXT,
    "last_error_message" TEXT,
    "last_fetched_count" INTEGER NOT NULL DEFAULT 0,
    "last_upserted_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "android_store_review_sync_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "android_store_review_fetch_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "store_mapping_id" UUID NOT NULL,
    "trigger_type" "review_fetch_trigger" NOT NULL DEFAULT 'scheduled',
    "status" "review_fetch_run_status" NOT NULL DEFAULT 'running',
    "max_results" INTEGER NOT NULL DEFAULT 100,
    "max_pages" INTEGER NOT NULL DEFAULT 2,
    "pages_fetched" INTEGER NOT NULL DEFAULT 0,
    "reviews_fetched" INTEGER NOT NULL DEFAULT 0,
    "reviews_upserted" INTEGER NOT NULL DEFAULT 0,
    "error_code" TEXT,
    "error_message" TEXT,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "finished_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "android_store_review_fetch_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "android_store_reviews_mapping_review_key"
    ON "android_store_reviews"("store_mapping_id", "review_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "android_store_reviews_mapping_user_updated_idx"
    ON "android_store_reviews"("store_mapping_id", "user_comment_updated_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "android_store_reviews_mapping_rating_idx"
    ON "android_store_reviews"("store_mapping_id", "rating");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "android_store_reviews_reply_updated_idx"
    ON "android_store_reviews"("developer_reply_updated_at");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "android_store_review_sync_states_store_mapping_id_key"
    ON "android_store_review_sync_states"("store_mapping_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "android_store_review_sync_states_status_started_idx"
    ON "android_store_review_sync_states"("status", "last_fetch_started_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "android_store_review_sync_states_success_idx"
    ON "android_store_review_sync_states"("last_success_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "android_store_review_fetch_runs_mapping_started_idx"
    ON "android_store_review_fetch_runs"("store_mapping_id", "started_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "android_store_review_fetch_runs_status_started_idx"
    ON "android_store_review_fetch_runs"("status", "started_at");

-- AddForeignKey
DO $$
BEGIN
  ALTER TABLE "android_store_reviews"
    ADD CONSTRAINT "android_store_reviews_store_mapping_id_fkey"
    FOREIGN KEY ("store_mapping_id")
    REFERENCES "android_store_mappings"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
  ALTER TABLE "android_store_review_sync_states"
    ADD CONSTRAINT "android_store_review_sync_states_store_mapping_id_fkey"
    FOREIGN KEY ("store_mapping_id")
    REFERENCES "android_store_mappings"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
  ALTER TABLE "android_store_review_fetch_runs"
    ADD CONSTRAINT "android_store_review_fetch_runs_store_mapping_id_fkey"
    FOREIGN KEY ("store_mapping_id")
    REFERENCES "android_store_mappings"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- RLS: keep review sync tables private by default.
-- Edge Functions use service_role; Next.js server APIs use the direct database connection.
ALTER TABLE "android_store_reviews" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "android_store_review_sync_states" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "android_store_review_fetch_runs" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  "android_store_reviews",
  "android_store_review_sync_states",
  "android_store_review_fetch_runs"
FROM anon, authenticated;

GRANT ALL ON TABLE
  "android_store_reviews",
  "android_store_review_sync_states",
  "android_store_review_fetch_runs"
TO service_role;
