CREATE TABLE "notification_schedules" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "store_platform" TEXT,
  "store_profile_id" UUID,
  "store_account_name" TEXT,
  "app_mapping_id" UUID,
  "app_name" TEXT NOT NULL,
  "package_name" TEXT,
  "bundle_id" TEXT,
  "topic_base" TEXT NOT NULL,
  "credential_ref" TEXT,
  "project_id" TEXT,
  "target_type" TEXT NOT NULL DEFAULT 'topic',
  "target_values" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "title" TEXT,
  "message" TEXT,
  "image_url" TEXT,
  "data_payload" JSONB NOT NULL DEFAULT '{}',
  "locale_payload" JSONB NOT NULL DEFAULT '[]',
  "schedule_type" TEXT NOT NULL DEFAULT 'once',
  "timezone" TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
  "scheduled_at" TIMESTAMPTZ(6),
  "time_of_day" TEXT,
  "day_of_month" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'active',
  "next_run_at" TIMESTAMPTZ(6),
  "last_run_at" TIMESTAMPTZ(6),
  "last_status" TEXT,
  "last_error" TEXT,
  "run_count" INTEGER NOT NULL DEFAULT 0,
  "created_by" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "notification_schedules_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "notification_jobs"
ADD COLUMN "schedule_id" UUID,
ADD COLUMN "target_values" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE INDEX "notification_jobs_schedule_created_idx" ON "notification_jobs"("schedule_id", "created_at");
CREATE INDEX "notification_schedules_status_next_run_idx" ON "notification_schedules"("status", "next_run_at");
CREATE INDEX "notification_schedules_platform_type_status_idx" ON "notification_schedules"("platform", "schedule_type", "status");
CREATE INDEX "notification_schedules_app_platform_created_idx" ON "notification_schedules"("app_name", "platform", "created_at");

ALTER TABLE "notification_jobs"
ADD CONSTRAINT "notification_jobs_schedule_id_fkey"
FOREIGN KEY ("schedule_id") REFERENCES "notification_schedules"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "notification_schedules" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "notification_schedules" FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "notification_schedules" TO authenticated;

CREATE POLICY "notification_schedules_admin_only"
ON "notification_schedules"
FOR ALL
TO authenticated
USING ("public"."is_console_admin"())
WITH CHECK ("public"."is_console_admin"());
