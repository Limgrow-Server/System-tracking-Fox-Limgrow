-- Track long-running console work across notification, comment/review, and future background flows.

CREATE TYPE "background_job_type" AS ENUM ('notification_send', 'review_fetch');

CREATE TYPE "background_job_status" AS ENUM ('queued', 'running', 'succeeded', 'failed', 'partial');

CREATE TABLE "background_jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "member_id" UUID NOT NULL,
    "created_by" TEXT NOT NULL,
    "type" "background_job_type" NOT NULL,
    "status" "background_job_status" NOT NULL DEFAULT 'queued',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "app_id" TEXT,
    "app_name" TEXT,
    "platform" TEXT,
    "store_account_name" TEXT,
    "source_job_id" UUID,
    "source_run_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "progress_current" INTEGER NOT NULL DEFAULT 0,
    "progress_total" INTEGER,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "last_error" TEXT,
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "background_jobs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "background_jobs_member_status_updated_idx"
ON "background_jobs"("member_id", "status", "updated_at");

CREATE INDEX "background_jobs_member_updated_idx"
ON "background_jobs"("member_id", "updated_at");

CREATE INDEX "background_jobs_status_updated_idx"
ON "background_jobs"("status", "updated_at");

CREATE INDEX "background_jobs_type_status_updated_idx"
ON "background_jobs"("type", "status", "updated_at");

CREATE INDEX "background_jobs_source_job_idx"
ON "background_jobs"("source_job_id");
