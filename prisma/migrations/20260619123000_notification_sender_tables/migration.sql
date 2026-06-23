CREATE TABLE "device_tokens" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" TEXT NOT NULL,
  "device_id" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "firebase_app_id" TEXT,
  "firebase_project_id" TEXT,
  "token_hash" TEXT NOT NULL,
  "fcm_token" TEXT NOT NULL,
  "app_version" TEXT,
  "os_version" TEXT,
  "locale" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "store_platform" TEXT,
  "store_account_name" TEXT,
  "product_app_id" TEXT,
  "package_name" TEXT,
  "bundle_id" TEXT,
  "device_model" TEXT,
  "device_manufacturer" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "device_tokens_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notification_jobs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
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
  "title" TEXT,
  "message" TEXT,
  "image_url" TEXT,
  "data_payload" JSONB NOT NULL DEFAULT '{}',
  "locale_payload" JSONB NOT NULL DEFAULT '[]',
  "status" TEXT NOT NULL DEFAULT 'draft',
  "sent_count" INTEGER NOT NULL DEFAULT 0,
  "error_count" INTEGER NOT NULL DEFAULT 0,
  "requested_by" TEXT,
  "sent_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "notification_jobs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notification_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "notification_id" TEXT NOT NULL,
  "job_id" UUID,
  "event_type" TEXT NOT NULL,
  "device_id" TEXT,
  "platform" TEXT,
  "target_type" TEXT,
  "target_value" TEXT,
  "status" TEXT,
  "provider_message_id" TEXT,
  "error_code" TEXT,
  "error_detail" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "notification_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "device_tokens_token_hash_key" ON "device_tokens"("token_hash");
CREATE INDEX "device_tokens_platform_status_seen_idx" ON "device_tokens"("platform", "status", "last_seen_at");
CREATE INDEX "device_tokens_device_platform_idx" ON "device_tokens"("device_id", "platform");
CREATE INDEX "device_tokens_app_platform_status_idx" ON "device_tokens"("product_app_id", "platform", "status");
CREATE INDEX "device_tokens_package_status_idx" ON "device_tokens"("package_name", "status");
CREATE INDEX "device_tokens_bundle_status_idx" ON "device_tokens"("bundle_id", "status");

CREATE INDEX "notification_jobs_platform_status_created_idx" ON "notification_jobs"("platform", "status", "created_at");
CREATE INDEX "notification_jobs_store_created_idx" ON "notification_jobs"("store_account_name", "created_at");
CREATE INDEX "notification_jobs_app_platform_created_idx" ON "notification_jobs"("app_name", "platform", "created_at");

CREATE INDEX "notification_events_notification_id_idx" ON "notification_events"("notification_id");
CREATE INDEX "notification_events_job_created_idx" ON "notification_events"("job_id", "created_at");
CREATE INDEX "notification_events_platform_event_created_idx" ON "notification_events"("platform", "event_type", "created_at");
CREATE INDEX "notification_events_device_created_idx" ON "notification_events"("device_id", "created_at");

ALTER TABLE "notification_events"
ADD CONSTRAINT "notification_events_job_id_fkey"
FOREIGN KEY ("job_id") REFERENCES "notification_jobs"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "device_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notification_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notification_events" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  "device_tokens",
  "notification_jobs",
  "notification_events"
FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  "device_tokens",
  "notification_jobs",
  "notification_events"
TO authenticated;

CREATE POLICY "device_tokens_admin_only"
ON "device_tokens"
FOR ALL
TO authenticated
USING ("public"."is_console_admin"())
WITH CHECK ("public"."is_console_admin"());

CREATE POLICY "notification_jobs_admin_only"
ON "notification_jobs"
FOR ALL
TO authenticated
USING ("public"."is_console_admin"())
WITH CHECK ("public"."is_console_admin"());

CREATE POLICY "notification_events_admin_only"
ON "notification_events"
FOR ALL
TO authenticated
USING ("public"."is_console_admin"())
WITH CHECK ("public"."is_console_admin"());
