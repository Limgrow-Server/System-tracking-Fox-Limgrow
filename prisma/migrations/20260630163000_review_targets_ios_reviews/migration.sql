-- Add shared review targets and iOS review storage.
-- Existing review data is linked/backfilled in this same migration so fetched
-- Android review records are preserved before code moves to the shared targets.

-- CreateEnum
CREATE TYPE "review_platform" AS ENUM ('android', 'ios');

-- AlterTable
ALTER TABLE "android_store_reviews"
ADD COLUMN "review_app_target_id" UUID;

-- AlterTable
ALTER TABLE "ios_store_mappings"
ADD COLUMN "apple_app_id" TEXT;

-- CreateTable
CREATE TABLE "review_store_targets" (
    "id" UUID NOT NULL,
    "platform" "review_platform" NOT NULL,
    "android_store_profile_id" UUID,
    "ios_store_profile_id" UUID,
    "store_account_name" TEXT NOT NULL,
    "contact_email" TEXT,
    "support_phone" TEXT,
    "website_url" TEXT,
    "status" "mapping_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "review_store_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_app_targets" (
    "id" UUID NOT NULL,
    "review_store_target_id" UUID NOT NULL,
    "platform" "review_platform" NOT NULL,
    "android_store_mapping_id" UUID,
    "ios_store_mapping_id" UUID,
    "app_name" TEXT NOT NULL,
    "app_identifier" TEXT NOT NULL,
    "status" "mapping_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "review_app_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_sync_states" (
    "id" UUID NOT NULL,
    "review_app_target_id" UUID NOT NULL,
    "status" "review_sync_status" NOT NULL DEFAULT 'idle',
    "last_fetch_started_at" TIMESTAMPTZ(6),
    "last_fetch_finished_at" TIMESTAMPTZ(6),
    "last_success_at" TIMESTAMPTZ(6),
    "last_review_activity_at" TIMESTAMPTZ(6),
    "locked_at" TIMESTAMPTZ(6),
    "locked_by" TEXT,
    "last_error_code" TEXT,
    "last_error_message" TEXT,
    "last_fetched_count" INTEGER NOT NULL DEFAULT 0,
    "last_upserted_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "review_sync_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_reply_templates" (
    "id" UUID NOT NULL,
    "review_app_target_id" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "reply_text" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_by" TEXT,
    "updated_by" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "review_reply_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_fetch_schedules" (
    "id" UUID NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'global',
    "status" "review_fetch_schedule_status" NOT NULL DEFAULT 'active',
    "interval_hours" INTEGER NOT NULL DEFAULT 8,
    "next_run_at" TIMESTAMPTZ(6),
    "last_run_at" TIMESTAMPTZ(6),
    "last_status" "review_fetch_run_status",
    "last_error_code" TEXT,
    "last_error_message" TEXT,
    "locked_at" TIMESTAMPTZ(6),
    "locked_by" TEXT,
    "run_count" INTEGER NOT NULL DEFAULT 0,
    "created_by" TEXT,
    "updated_by" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "review_fetch_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_fetch_runs" (
    "id" UUID NOT NULL,
    "review_app_target_id" UUID NOT NULL,
    "source_schedule_id" UUID,
    "platform" "review_platform" NOT NULL,
    "trigger_type" "review_fetch_trigger" NOT NULL DEFAULT 'scheduled',
    "status" "review_fetch_run_status" NOT NULL DEFAULT 'pending',
    "scan_mode" "review_fetch_scan_mode" NOT NULL DEFAULT 'limited',
    "stop_reason" "review_fetch_stop_reason",
    "scheduled_for" TIMESTAMPTZ(6),
    "next_attempt_at" TIMESTAMPTZ(6),
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "locked_at" TIMESTAMPTZ(6),
    "locked_by" TEXT,
    "max_results" INTEGER NOT NULL DEFAULT 100,
    "request_count" INTEGER NOT NULL DEFAULT 0,
    "next_page_token" TEXT,
    "next_page_url" TEXT,
    "pages_fetched" INTEGER NOT NULL DEFAULT 0,
    "reviews_fetched" INTEGER NOT NULL DEFAULT 0,
    "reviews_upserted" INTEGER NOT NULL DEFAULT 0,
    "rate_limit_limit" INTEGER,
    "rate_limit_remaining" INTEGER,
    "last_rate_limit_header" TEXT,
    "rate_limit_observed_at" TIMESTAMPTZ(6),
    "error_code" TEXT,
    "error_message" TEXT,
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "review_fetch_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ios_store_reviews" (
    "id" UUID NOT NULL,
    "review_app_target_id" UUID NOT NULL,
    "review_id" TEXT NOT NULL,
    "author_name" TEXT,
    "rating" INTEGER,
    "title" TEXT,
    "review_text" TEXT,
    "territory" TEXT,
    "app_version" TEXT,
    "review_created_at" TIMESTAMPTZ(6),
    "review_updated_at" TIMESTAMPTZ(6),
    "developer_reply_id" TEXT,
    "developer_reply_text" TEXT,
    "developer_reply_updated_at" TIMESTAMPTZ(6),
    "raw_review" JSONB,
    "fetched_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ios_store_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ios_store_mappings_apple_app_id_key"
ON "ios_store_mappings"("apple_app_id");

-- CreateIndex
CREATE INDEX "ios_store_mappings_apple_app_id_status_idx"
ON "ios_store_mappings"("apple_app_id", "status");

-- CreateIndex
CREATE INDEX "android_store_reviews_app_target_idx"
ON "android_store_reviews"("review_app_target_id");

-- CreateIndex
CREATE UNIQUE INDEX "review_store_targets_android_store_profile_id_key"
ON "review_store_targets"("android_store_profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "review_store_targets_ios_store_profile_id_key"
ON "review_store_targets"("ios_store_profile_id");

-- CreateIndex
CREATE INDEX "review_store_targets_platform_status_idx"
ON "review_store_targets"("platform", "status");

-- CreateIndex
CREATE INDEX "review_store_targets_store_name_idx"
ON "review_store_targets"("store_account_name");

-- CreateIndex
CREATE UNIQUE INDEX "review_app_targets_android_store_mapping_id_key"
ON "review_app_targets"("android_store_mapping_id");

-- CreateIndex
CREATE UNIQUE INDEX "review_app_targets_ios_store_mapping_id_key"
ON "review_app_targets"("ios_store_mapping_id");

-- CreateIndex
CREATE INDEX "review_app_targets_store_status_idx"
ON "review_app_targets"("review_store_target_id", "status");

-- CreateIndex
CREATE INDEX "review_app_targets_platform_status_idx"
ON "review_app_targets"("platform", "status");

-- CreateIndex
CREATE INDEX "review_app_targets_identifier_idx"
ON "review_app_targets"("app_identifier");

-- CreateIndex
CREATE UNIQUE INDEX "review_sync_states_review_app_target_id_key"
ON "review_sync_states"("review_app_target_id");

-- CreateIndex
CREATE INDEX "review_sync_states_status_started_idx"
ON "review_sync_states"("status", "last_fetch_started_at");

-- CreateIndex
CREATE INDEX "review_sync_states_success_idx"
ON "review_sync_states"("last_success_at");

-- CreateIndex
CREATE UNIQUE INDEX "review_reply_templates_app_rating_key"
ON "review_reply_templates"("review_app_target_id", "rating");

-- CreateIndex
CREATE INDEX "review_reply_templates_app_active_idx"
ON "review_reply_templates"("review_app_target_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "review_fetch_schedules_scope_key"
ON "review_fetch_schedules"("scope");

-- CreateIndex
CREATE INDEX "review_fetch_schedules_status_next_idx"
ON "review_fetch_schedules"("status", "next_run_at");

-- CreateIndex
CREATE INDEX "review_fetch_schedules_locked_idx"
ON "review_fetch_schedules"("locked_at");

-- CreateIndex
CREATE UNIQUE INDEX "review_fetch_runs_app_trigger_scheduled_key"
ON "review_fetch_runs"("review_app_target_id", "trigger_type", "scheduled_for");

-- CreateIndex
CREATE INDEX "review_fetch_runs_status_next_attempt_idx"
ON "review_fetch_runs"("status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "review_fetch_runs_status_locked_idx"
ON "review_fetch_runs"("status", "locked_at");

-- CreateIndex
CREATE INDEX "review_fetch_runs_app_created_idx"
ON "review_fetch_runs"("review_app_target_id", "created_at");

-- CreateIndex
CREATE INDEX "review_fetch_runs_schedule_for_idx"
ON "review_fetch_runs"("source_schedule_id", "scheduled_for");

-- CreateIndex
CREATE INDEX "review_fetch_runs_platform_status_created_idx"
ON "review_fetch_runs"("platform", "status", "created_at");

-- CreateIndex
CREATE INDEX "review_fetch_runs_created_idx"
ON "review_fetch_runs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "ios_store_reviews_app_review_key"
ON "ios_store_reviews"("review_app_target_id", "review_id");

-- CreateIndex
CREATE INDEX "ios_store_reviews_app_created_idx"
ON "ios_store_reviews"("review_app_target_id", "review_created_at");

-- CreateIndex
CREATE INDEX "ios_store_reviews_app_rating_idx"
ON "ios_store_reviews"("review_app_target_id", "rating");

-- CreateIndex
CREATE INDEX "ios_store_reviews_reply_updated_idx"
ON "ios_store_reviews"("developer_reply_updated_at");

-- CreateIndex
CREATE INDEX "ios_store_reviews_territory_idx"
ON "ios_store_reviews"("territory");

-- AddForeignKey
ALTER TABLE "review_store_targets"
ADD CONSTRAINT "review_store_targets_android_store_profile_id_fkey"
FOREIGN KEY ("android_store_profile_id") REFERENCES "android_store_profiles"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_store_targets"
ADD CONSTRAINT "review_store_targets_ios_store_profile_id_fkey"
FOREIGN KEY ("ios_store_profile_id") REFERENCES "ios_store_profiles"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_app_targets"
ADD CONSTRAINT "review_app_targets_review_store_target_id_fkey"
FOREIGN KEY ("review_store_target_id") REFERENCES "review_store_targets"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_app_targets"
ADD CONSTRAINT "review_app_targets_android_store_mapping_id_fkey"
FOREIGN KEY ("android_store_mapping_id") REFERENCES "android_store_mappings"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_app_targets"
ADD CONSTRAINT "review_app_targets_ios_store_mapping_id_fkey"
FOREIGN KEY ("ios_store_mapping_id") REFERENCES "ios_store_mappings"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "android_store_reviews"
ADD CONSTRAINT "android_store_reviews_review_app_target_id_fkey"
FOREIGN KEY ("review_app_target_id") REFERENCES "review_app_targets"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_sync_states"
ADD CONSTRAINT "review_sync_states_review_app_target_id_fkey"
FOREIGN KEY ("review_app_target_id") REFERENCES "review_app_targets"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_reply_templates"
ADD CONSTRAINT "review_reply_templates_review_app_target_id_fkey"
FOREIGN KEY ("review_app_target_id") REFERENCES "review_app_targets"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_fetch_runs"
ADD CONSTRAINT "review_fetch_runs_review_app_target_id_fkey"
FOREIGN KEY ("review_app_target_id") REFERENCES "review_app_targets"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_fetch_runs"
ADD CONSTRAINT "review_fetch_runs_source_schedule_id_fkey"
FOREIGN KEY ("source_schedule_id") REFERENCES "review_fetch_schedules"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ios_store_reviews"
ADD CONSTRAINT "ios_store_reviews_review_app_target_id_fkey"
FOREIGN KEY ("review_app_target_id") REFERENCES "review_app_targets"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill shared review targets from existing Android/iOS store profiles and app mappings.
-- This only copies/links data into the new review tables and fills the optional
-- android_store_reviews.review_app_target_id bridge. Legacy review rows remain in place.

-- Extract Apple App Store app id from existing App Store links when possible.
UPDATE "ios_store_mappings"
SET "apple_app_id" = substring("app_link" FROM 'id([0-9]+)')
WHERE "apple_app_id" IS NULL
  AND "app_link" IS NOT NULL
  AND "app_link" ~ 'id[0-9]+';

-- Android store targets.
INSERT INTO "review_store_targets" (
    "id",
    "platform",
    "android_store_profile_id",
    "store_account_name",
    "contact_email",
    "support_phone",
    "website_url",
    "status",
    "created_at",
    "updated_at"
)
SELECT
    gen_random_uuid(),
    'android'::"review_platform",
    "id",
    "store_account_name",
    "contact_email",
    "support_phone",
    "website_url",
    "status",
    "created_at",
    "updated_at"
FROM "android_store_profiles"
ON CONFLICT ("android_store_profile_id") DO UPDATE
SET
    "store_account_name" = EXCLUDED."store_account_name",
    "contact_email" = EXCLUDED."contact_email",
    "support_phone" = EXCLUDED."support_phone",
    "website_url" = EXCLUDED."website_url",
    "status" = EXCLUDED."status",
    "updated_at" = EXCLUDED."updated_at";

-- iOS store targets.
INSERT INTO "review_store_targets" (
    "id",
    "platform",
    "ios_store_profile_id",
    "store_account_name",
    "status",
    "created_at",
    "updated_at"
)
SELECT
    gen_random_uuid(),
    'ios'::"review_platform",
    "id",
    "store_account_name",
    "status",
    "created_at",
    "updated_at"
FROM "ios_store_profiles"
ON CONFLICT ("ios_store_profile_id") DO UPDATE
SET
    "store_account_name" = EXCLUDED."store_account_name",
    "status" = EXCLUDED."status",
    "updated_at" = EXCLUDED."updated_at";

-- Android app targets.
INSERT INTO "review_app_targets" (
    "id",
    "review_store_target_id",
    "platform",
    "android_store_mapping_id",
    "app_name",
    "app_identifier",
    "status",
    "created_at",
    "updated_at"
)
SELECT
    gen_random_uuid(),
    "store_targets"."id",
    'android'::"review_platform",
    "mappings"."id",
    "mappings"."app_name",
    "mappings"."package_name",
    "mappings"."status",
    "mappings"."created_at",
    "mappings"."updated_at"
FROM "android_store_mappings" AS "mappings"
JOIN "review_store_targets" AS "store_targets"
  ON "store_targets"."android_store_profile_id" = "mappings"."store_profile_id"
ON CONFLICT ("android_store_mapping_id") DO UPDATE
SET
    "review_store_target_id" = EXCLUDED."review_store_target_id",
    "app_name" = EXCLUDED."app_name",
    "app_identifier" = EXCLUDED."app_identifier",
    "status" = EXCLUDED."status",
    "updated_at" = EXCLUDED."updated_at";

-- iOS app targets.
INSERT INTO "review_app_targets" (
    "id",
    "review_store_target_id",
    "platform",
    "ios_store_mapping_id",
    "app_name",
    "app_identifier",
    "status",
    "created_at",
    "updated_at"
)
SELECT
    gen_random_uuid(),
    "store_targets"."id",
    'ios'::"review_platform",
    "mappings"."id",
    "mappings"."app_name",
    COALESCE(NULLIF("mappings"."apple_app_id", ''), NULLIF("mappings"."app_id", ''), "mappings"."bundle_id"),
    "mappings"."status",
    "mappings"."created_at",
    "mappings"."updated_at"
FROM "ios_store_mappings" AS "mappings"
JOIN "review_store_targets" AS "store_targets"
  ON "store_targets"."ios_store_profile_id" = "mappings"."store_profile_id"
ON CONFLICT ("ios_store_mapping_id") DO UPDATE
SET
    "review_store_target_id" = EXCLUDED."review_store_target_id",
    "app_name" = EXCLUDED."app_name",
    "app_identifier" = EXCLUDED."app_identifier",
    "status" = EXCLUDED."status",
    "updated_at" = EXCLUDED."updated_at";

-- Link existing Android review rows to their shared app targets.
UPDATE "android_store_reviews" AS "reviews"
SET "review_app_target_id" = "targets"."id"
FROM "review_app_targets" AS "targets"
WHERE "targets"."android_store_mapping_id" = "reviews"."store_mapping_id"
  AND (
    "reviews"."review_app_target_id" IS NULL
    OR "reviews"."review_app_target_id" <> "targets"."id"
  );

-- Copy Android sync states into the shared sync table when the legacy state table exists.
DO $$
BEGIN
  IF to_regclass('public.android_store_review_sync_states') IS NOT NULL THEN
    INSERT INTO "review_sync_states" (
        "id",
        "review_app_target_id",
        "status",
        "last_fetch_started_at",
        "last_fetch_finished_at",
        "last_success_at",
        "last_review_activity_at",
        "locked_at",
        "locked_by",
        "last_error_code",
        "last_error_message",
        "last_fetched_count",
        "last_upserted_count",
        "created_at",
        "updated_at"
    )
    SELECT
        "sync_states"."id",
        "targets"."id",
        "sync_states"."status",
        "sync_states"."last_fetch_started_at",
        "sync_states"."last_fetch_finished_at",
        "sync_states"."last_success_at",
        "sync_states"."last_review_updated_at",
        "sync_states"."locked_at",
        "sync_states"."locked_by",
        "sync_states"."last_error_code",
        "sync_states"."last_error_message",
        "sync_states"."last_fetched_count",
        "sync_states"."last_upserted_count",
        "sync_states"."created_at",
        "sync_states"."updated_at"
    FROM "android_store_review_sync_states" AS "sync_states"
    JOIN "review_app_targets" AS "targets"
      ON "targets"."android_store_mapping_id" = "sync_states"."store_mapping_id"
    ON CONFLICT ("review_app_target_id") DO UPDATE
    SET
        "status" = EXCLUDED."status",
        "last_fetch_started_at" = EXCLUDED."last_fetch_started_at",
        "last_fetch_finished_at" = EXCLUDED."last_fetch_finished_at",
        "last_success_at" = EXCLUDED."last_success_at",
        "last_review_activity_at" = EXCLUDED."last_review_activity_at",
        "locked_at" = EXCLUDED."locked_at",
        "locked_by" = EXCLUDED."locked_by",
        "last_error_code" = EXCLUDED."last_error_code",
        "last_error_message" = EXCLUDED."last_error_message",
        "last_fetched_count" = EXCLUDED."last_fetched_count",
        "last_upserted_count" = EXCLUDED."last_upserted_count",
        "updated_at" = EXCLUDED."updated_at";
  END IF;
END $$;

-- Copy Android reply templates into the shared template table when the legacy table exists.
DO $$
BEGIN
  IF to_regclass('public.android_store_review_reply_templates') IS NOT NULL THEN
    INSERT INTO "review_reply_templates" (
        "id",
        "review_app_target_id",
        "rating",
        "reply_text",
        "is_active",
        "created_by",
        "updated_by",
        "created_at",
        "updated_at"
    )
    SELECT
        "templates"."id",
        "targets"."id",
        "templates"."rating",
        "templates"."reply_text",
        "templates"."is_active",
        "templates"."created_by",
        "templates"."updated_by",
        "templates"."created_at",
        "templates"."updated_at"
    FROM "android_store_review_reply_templates" AS "templates"
    JOIN "review_app_targets" AS "targets"
      ON "targets"."android_store_mapping_id" = "templates"."store_mapping_id"
    ON CONFLICT ("review_app_target_id", "rating") DO UPDATE
    SET
        "reply_text" = EXCLUDED."reply_text",
        "is_active" = EXCLUDED."is_active",
        "updated_by" = EXCLUDED."updated_by",
        "updated_at" = EXCLUDED."updated_at";
  END IF;
END $$;

-- Copy Android fetch run logs into the shared fetch run table when the legacy table exists.
-- source_schedule_id is intentionally left NULL because legacy schedule rows are not carried over.
DO $$
BEGIN
  IF to_regclass('public.android_store_review_fetch_runs') IS NOT NULL THEN
    INSERT INTO "review_fetch_runs" (
        "id",
        "review_app_target_id",
        "platform",
        "trigger_type",
        "status",
        "scan_mode",
        "stop_reason",
        "scheduled_for",
        "next_attempt_at",
        "attempt_count",
        "max_attempts",
        "locked_at",
        "locked_by",
        "max_results",
        "request_count",
        "next_page_token",
        "pages_fetched",
        "reviews_fetched",
        "reviews_upserted",
        "error_code",
        "error_message",
        "started_at",
        "finished_at",
        "created_at",
        "updated_at"
    )
    SELECT
        "runs"."id",
        "targets"."id",
        'android'::"review_platform",
        "runs"."trigger_type",
        "runs"."status",
        "runs"."scan_mode",
        "runs"."stop_reason",
        "runs"."scheduled_for",
        "runs"."next_attempt_at",
        "runs"."attempt_count",
        "runs"."max_attempts",
        "runs"."locked_at",
        "runs"."locked_by",
        "runs"."max_results",
        "runs"."request_count",
        "runs"."next_page_token",
        "runs"."pages_fetched",
        "runs"."reviews_fetched",
        "runs"."reviews_upserted",
        "runs"."error_code",
        "runs"."error_message",
        "runs"."started_at",
        "runs"."finished_at",
        "runs"."created_at",
        "runs"."updated_at"
    FROM "android_store_review_fetch_runs" AS "runs"
    JOIN "review_app_targets" AS "targets"
      ON "targets"."android_store_mapping_id" = "runs"."store_mapping_id"
    ON CONFLICT ("id") DO UPDATE
    SET
        "review_app_target_id" = EXCLUDED."review_app_target_id",
        "platform" = EXCLUDED."platform",
        "trigger_type" = EXCLUDED."trigger_type",
        "status" = EXCLUDED."status",
        "scan_mode" = EXCLUDED."scan_mode",
        "stop_reason" = EXCLUDED."stop_reason",
        "scheduled_for" = EXCLUDED."scheduled_for",
        "next_attempt_at" = EXCLUDED."next_attempt_at",
        "attempt_count" = EXCLUDED."attempt_count",
        "max_attempts" = EXCLUDED."max_attempts",
        "locked_at" = EXCLUDED."locked_at",
        "locked_by" = EXCLUDED."locked_by",
        "max_results" = EXCLUDED."max_results",
        "request_count" = EXCLUDED."request_count",
        "next_page_token" = EXCLUDED."next_page_token",
        "pages_fetched" = EXCLUDED."pages_fetched",
        "reviews_fetched" = EXCLUDED."reviews_fetched",
        "reviews_upserted" = EXCLUDED."reviews_upserted",
        "error_code" = EXCLUDED."error_code",
        "error_message" = EXCLUDED."error_message",
        "started_at" = EXCLUDED."started_at",
        "finished_at" = EXCLUDED."finished_at",
        "updated_at" = EXCLUDED."updated_at";
  END IF;
END $$;

-- Sanity checks. These raise before code depends on incomplete backfill data.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "android_store_profiles" AS "profiles"
    LEFT JOIN "review_store_targets" AS "targets"
      ON "targets"."android_store_profile_id" = "profiles"."id"
    WHERE "targets"."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Backfill failed: some Android store profiles have no review_store_targets row.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "ios_store_profiles" AS "profiles"
    LEFT JOIN "review_store_targets" AS "targets"
      ON "targets"."ios_store_profile_id" = "profiles"."id"
    WHERE "targets"."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Backfill failed: some iOS store profiles have no review_store_targets row.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "android_store_mappings" AS "mappings"
    LEFT JOIN "review_app_targets" AS "targets"
      ON "targets"."android_store_mapping_id" = "mappings"."id"
    WHERE "targets"."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Backfill failed: some Android store mappings have no review_app_targets row.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "ios_store_mappings" AS "mappings"
    LEFT JOIN "review_app_targets" AS "targets"
      ON "targets"."ios_store_mapping_id" = "mappings"."id"
    WHERE "targets"."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Backfill failed: some iOS store mappings have no review_app_targets row.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "android_store_reviews"
    WHERE "review_app_target_id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Backfill failed: some Android reviews are not linked to review_app_targets.';
  END IF;

  IF to_regclass('public.android_store_review_fetch_runs') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM "android_store_review_fetch_runs" AS "runs"
      LEFT JOIN "review_fetch_runs" AS "shared_runs"
        ON "shared_runs"."id" = "runs"."id"
      WHERE "shared_runs"."id" IS NULL
    )
  THEN
    RAISE EXCEPTION 'Backfill failed: some Android fetch runs were not copied.';
  END IF;
END $$;
