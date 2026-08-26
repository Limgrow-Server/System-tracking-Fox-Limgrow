-- Google Play RTDN inbox/outbox, immutable purchase history, and paid-event delivery jobs.

ALTER TABLE "android_store_mappings"
  ADD COLUMN IF NOT EXISTS "firebase_app_id" TEXT,
  ADD COLUMN IF NOT EXISTS "firebase_analytics_api_secret" TEXT;

ALTER TABLE "iap_android"
  ADD COLUMN IF NOT EXISTS "store_mapping_id" UUID,
  ADD COLUMN IF NOT EXISTS "current_order_id" TEXT,
  ADD COLUMN IF NOT EXISTS "offer_phase" TEXT,
  ADD COLUMN IF NOT EXISTS "is_trial" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "trial_started_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "trial_ends_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "had_free_trial" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "ingestion_source" TEXT NOT NULL DEFAULT 'client',
  ADD COLUMN IF NOT EXISTS "external_account_id" TEXT,
  ADD COLUMN IF NOT EXISTS "external_profile_id" TEXT,
  ADD COLUMN IF NOT EXISTS "user_id" TEXT,
  ADD COLUMN IF NOT EXISTS "app_instance_id" TEXT,
  ADD COLUMN IF NOT EXISTS "installation_id" TEXT,
  ADD COLUMN IF NOT EXISTS "adjust_adid" TEXT,
  ADD COLUMN IF NOT EXISTS "gps_adid" TEXT,
  ADD COLUMN IF NOT EXISTS "last_notification_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "last_rtdn_event_id" UUID,
  ADD COLUMN IF NOT EXISTS "provider_etag" TEXT,
  ADD COLUMN IF NOT EXISTS "last_provider_sync_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "entitlement_active" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "superseded_by_purchase_token" TEXT;

CREATE TABLE IF NOT EXISTS "android_rtdn_configs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "store_profile_id" UUID NOT NULL,
  "project_id" TEXT NOT NULL,
  "topic_name" TEXT NOT NULL,
  "subscription_name" TEXT NOT NULL,
  "oidc_audience" TEXT NOT NULL,
  "push_service_account_email" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "android_rtdn_configs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "android_iap_rtdn_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "store_profile_id" UUID NOT NULL,
  "store_mapping_id" UUID,
  "purchase_id" UUID,
  "topic_name" TEXT NOT NULL,
  "subscription_name" TEXT NOT NULL,
  "pubsub_message_id" TEXT NOT NULL,
  "publish_time" TIMESTAMPTZ(6),
  "delivery_attempt" INTEGER,
  "package_name" TEXT,
  "event_time" TIMESTAMPTZ(6) NOT NULL,
  "notification_kind" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'google_play_rtdn',
  "notification_type" INTEGER,
  "notification_name" TEXT,
  "purchase_token" TEXT,
  "product_id" TEXT,
  "order_id" TEXT,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "max_attempts" INTEGER NOT NULL DEFAULT 8,
  "next_attempt_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "locked_at" TIMESTAMPTZ(6),
  "locked_by" TEXT,
  "last_error" TEXT,
  "raw_payload" JSONB NOT NULL,
  "attributes" JSONB NOT NULL DEFAULT '{}',
  "payload_sha256" TEXT NOT NULL,
  "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "android_iap_rtdn_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "android_iap_rtdn_events_status_check"
    CHECK ("status" IN ('queued', 'processing', 'processed', 'ignored', 'retrying', 'failed')),
  CONSTRAINT "android_iap_rtdn_events_source_check"
    CHECK ("source" IN ('google_play_rtdn', 'mobile_verify', 'reconciliation')),
  CONSTRAINT "android_iap_rtdn_events_attempts_check"
    CHECK ("attempt_count" >= 0 AND "max_attempts" > 0),
  CONSTRAINT "android_iap_rtdn_events_delivery_attempt_check"
    CHECK ("delivery_attempt" IS NULL OR "delivery_attempt" > 0)
);

CREATE TABLE IF NOT EXISTS "android_iap_line_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "purchase_id" UUID NOT NULL,
  "line_item_key" TEXT NOT NULL,
  "product_id" TEXT NOT NULL,
  "base_plan_id" TEXT,
  "offer_id" TEXT,
  "purchase_option_id" TEXT,
  "plan_type" TEXT,
  "offer_phase" TEXT,
  "expiry_time" TIMESTAMPTZ(6),
  "latest_successful_order_id" TEXT,
  "auto_renew_enabled" BOOLEAN,
  "quantity" INTEGER,
  "refundable_quantity" INTEGER,
  "consumption_state" TEXT,
  "raw_line_item" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "android_iap_line_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "android_iap_line_items_quantity_check"
    CHECK (("quantity" IS NULL OR "quantity" >= 0) AND ("refundable_quantity" IS NULL OR "refundable_quantity" >= 0))
);

CREATE TABLE IF NOT EXISTS "android_iap_orders" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "purchase_id" UUID,
  "store_profile_id" UUID NOT NULL,
  "store_mapping_id" UUID NOT NULL,
  "package_name" TEXT NOT NULL,
  "purchase_token" TEXT,
  "order_id" TEXT NOT NULL,
  "product_id" TEXT,
  "order_kind" TEXT NOT NULL,
  "classification" TEXT,
  "offer_phase" TEXT,
  "state" TEXT NOT NULL,
  "created_at_provider" TIMESTAMPTZ(6),
  "processed_at" TIMESTAMPTZ(6),
  "refunded_at" TIMESTAMPTZ(6),
  "last_event_at" TIMESTAMPTZ(6),
  "gross_amount_micros" BIGINT,
  "tax_micros" BIGINT,
  "developer_revenue_micros" BIGINT,
  "refunded_amount_micros" BIGINT,
  "currency" TEXT,
  "quantity" INTEGER,
  "refunded_quantity" INTEGER,
  "is_trial" BOOLEAN NOT NULL DEFAULT false,
  "raw_order" JSONB NOT NULL,
  "last_synced_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "android_iap_orders_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "android_iap_orders_amounts_check" CHECK (
    ("gross_amount_micros" IS NULL OR "gross_amount_micros" >= 0)
    AND ("tax_micros" IS NULL OR "tax_micros" >= 0)
    AND ("developer_revenue_micros" IS NULL OR "developer_revenue_micros" >= 0)
    AND ("refunded_amount_micros" IS NULL OR "refunded_amount_micros" >= 0)
  ),
  CONSTRAINT "android_iap_orders_quantity_check" CHECK (
    ("quantity" IS NULL OR "quantity" >= 0)
    AND ("refunded_quantity" IS NULL OR "refunded_quantity" >= 0)
  )
);

CREATE TABLE IF NOT EXISTS "android_iap_lifecycle_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "purchase_id" UUID,
  "rtdn_event_id" UUID,
  "store_profile_id" UUID NOT NULL,
  "store_mapping_id" UUID NOT NULL,
  "package_name" TEXT NOT NULL,
  "event_key" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "notification_type" INTEGER,
  "order_id" TEXT,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL,
  "previous_state" TEXT,
  "new_state" TEXT,
  "amount_micros" BIGINT,
  "currency" TEXT,
  "payload" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "android_iap_lifecycle_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "android_iap_queue_outbox" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "rtdn_event_id" UUID NOT NULL,
  "message_type" TEXT NOT NULL DEFAULT 'android-iap.reconcile.v1',
  "dedupe_key" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "available_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "published_at" TIMESTAMPTZ(6),
  "publish_attempts" INTEGER NOT NULL DEFAULT 0,
  "locked_at" TIMESTAMPTZ(6),
  "locked_by" TEXT,
  "last_error" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "android_iap_queue_outbox_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "android_iap_queue_outbox_status_check"
    CHECK ("status" IN ('pending', 'publishing', 'published', 'failed')),
  CONSTRAINT "android_iap_queue_outbox_attempts_check" CHECK ("publish_attempts" >= 0)
);

CREATE TABLE IF NOT EXISTS "android_iap_delivery_jobs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "lifecycle_event_id" UUID NOT NULL,
  "order_id" UUID,
  "destination" TEXT NOT NULL,
  "event_name" TEXT NOT NULL DEFAULT 'purchase',
  "status" TEXT NOT NULL DEFAULT 'pending',
  "available_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "published_at" TIMESTAMPTZ(6),
  "publish_attempts" INTEGER NOT NULL DEFAULT 0,
  "delivery_attempts" INTEGER NOT NULL DEFAULT 0,
  "max_attempts" INTEGER NOT NULL DEFAULT 5,
  "locked_at" TIMESTAMPTZ(6),
  "locked_by" TEXT,
  "response_status" INTEGER,
  "last_error" TEXT,
  "result" JSONB NOT NULL DEFAULT '{}',
  "delivered_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "android_iap_delivery_jobs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "android_iap_delivery_jobs_destination_check" CHECK ("destination" IN ('adjust', 'ga4')),
  CONSTRAINT "android_iap_delivery_jobs_status_check"
    CHECK ("status" IN ('pending', 'publishing', 'published', 'delivering', 'retrying', 'sent', 'skipped', 'failed')),
  CONSTRAINT "android_iap_delivery_jobs_attempts_check"
    CHECK ("publish_attempts" >= 0 AND "delivery_attempts" >= 0 AND "max_attempts" > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "android_rtdn_configs_store_profile_id_key"
  ON "android_rtdn_configs"("store_profile_id");
CREATE UNIQUE INDEX IF NOT EXISTS "android_rtdn_configs_subscription_name_key"
  ON "android_rtdn_configs"("subscription_name");
CREATE INDEX IF NOT EXISTS "android_rtdn_configs_enabled_project_idx"
  ON "android_rtdn_configs"("enabled", "project_id");
CREATE INDEX IF NOT EXISTS "android_rtdn_configs_audience_enabled_idx"
  ON "android_rtdn_configs"("oidc_audience", "enabled");
CREATE INDEX IF NOT EXISTS "android_rtdn_configs_topic_idx"
  ON "android_rtdn_configs"("topic_name");

CREATE UNIQUE INDEX IF NOT EXISTS "android_iap_rtdn_events_topic_message_key"
  ON "android_iap_rtdn_events"("topic_name", "pubsub_message_id");
CREATE INDEX IF NOT EXISTS "android_iap_rtdn_events_status_due_idx"
  ON "android_iap_rtdn_events"("status", "next_attempt_at", "received_at");
CREATE INDEX IF NOT EXISTS "android_iap_rtdn_events_package_event_idx"
  ON "android_iap_rtdn_events"("package_name", "event_time" DESC);
CREATE INDEX IF NOT EXISTS "android_iap_rtdn_events_purchase_token_idx"
  ON "android_iap_rtdn_events"("purchase_token");
CREATE INDEX IF NOT EXISTS "android_iap_rtdn_events_order_idx"
  ON "android_iap_rtdn_events"("order_id");
CREATE INDEX IF NOT EXISTS "android_iap_rtdn_events_mapping_received_idx"
  ON "android_iap_rtdn_events"("store_mapping_id", "received_at" DESC);
CREATE INDEX IF NOT EXISTS "android_iap_rtdn_events_mobile_package_received_idx"
  ON "android_iap_rtdn_events"("package_name", "received_at" DESC)
  WHERE "source" = 'mobile_verify';
CREATE INDEX IF NOT EXISTS "android_iap_rtdn_events_mobile_profile_status_idx"
  ON "android_iap_rtdn_events"("store_profile_id", "status", "received_at" DESC)
  WHERE "source" = 'mobile_verify';

CREATE UNIQUE INDEX IF NOT EXISTS "android_iap_line_items_purchase_key"
  ON "android_iap_line_items"("purchase_id", "line_item_key");
CREATE INDEX IF NOT EXISTS "android_iap_line_items_product_idx"
  ON "android_iap_line_items"("product_id");
CREATE INDEX IF NOT EXISTS "android_iap_line_items_order_idx"
  ON "android_iap_line_items"("latest_successful_order_id");

CREATE UNIQUE INDEX IF NOT EXISTS "android_iap_orders_package_order_key"
  ON "android_iap_orders"("package_name", "order_id");
CREATE INDEX IF NOT EXISTS "android_iap_orders_purchase_created_idx"
  ON "android_iap_orders"("purchase_id", "created_at_provider" DESC);
CREATE INDEX IF NOT EXISTS "android_iap_orders_package_created_idx"
  ON "android_iap_orders"("package_name", "created_at_provider" DESC);
CREATE INDEX IF NOT EXISTS "android_iap_orders_state_event_idx"
  ON "android_iap_orders"("state", "last_event_at");
CREATE INDEX IF NOT EXISTS "android_iap_orders_mapping_processed_idx"
  ON "android_iap_orders"("store_mapping_id", "processed_at" DESC)
  WHERE lower("state") = 'processed';
CREATE INDEX IF NOT EXISTS "android_iap_orders_package_profile_processed_idx"
  ON "android_iap_orders"("package_name", "store_profile_id", "processed_at" DESC)
  WHERE lower("state") = 'processed';

CREATE UNIQUE INDEX IF NOT EXISTS "android_iap_lifecycle_events_event_key_key"
  ON "android_iap_lifecycle_events"("event_key");
CREATE INDEX IF NOT EXISTS "android_iap_lifecycle_purchase_occurred_idx"
  ON "android_iap_lifecycle_events"("purchase_id", "occurred_at" DESC);
CREATE INDEX IF NOT EXISTS "android_iap_lifecycle_mapping_occurred_idx"
  ON "android_iap_lifecycle_events"("store_mapping_id", "occurred_at" DESC);
CREATE INDEX IF NOT EXISTS "android_iap_lifecycle_type_occurred_idx"
  ON "android_iap_lifecycle_events"("event_type", "occurred_at" DESC);
CREATE INDEX IF NOT EXISTS "android_iap_lifecycle_rtdn_event_idx"
  ON "android_iap_lifecycle_events"("rtdn_event_id");

CREATE UNIQUE INDEX IF NOT EXISTS "android_iap_queue_outbox_rtdn_event_id_key"
  ON "android_iap_queue_outbox"("rtdn_event_id");
CREATE UNIQUE INDEX IF NOT EXISTS "android_iap_queue_outbox_dedupe_key_key"
  ON "android_iap_queue_outbox"("dedupe_key");
CREATE INDEX IF NOT EXISTS "android_iap_queue_outbox_publish_due_idx"
  ON "android_iap_queue_outbox"("status", "available_at", "created_at");
CREATE INDEX IF NOT EXISTS "android_iap_queue_outbox_locked_idx"
  ON "android_iap_queue_outbox"("locked_at");

CREATE UNIQUE INDEX IF NOT EXISTS "android_iap_delivery_jobs_lifecycle_destination_event_key"
  ON "android_iap_delivery_jobs"("lifecycle_event_id", "destination", "event_name");
CREATE UNIQUE INDEX IF NOT EXISTS "android_iap_delivery_jobs_order_destination_event_key"
  ON "android_iap_delivery_jobs"("order_id", "destination", "event_name");
CREATE INDEX IF NOT EXISTS "android_iap_delivery_jobs_publish_due_idx"
  ON "android_iap_delivery_jobs"("status", "available_at", "created_at");
CREATE INDEX IF NOT EXISTS "android_iap_delivery_jobs_order_idx"
  ON "android_iap_delivery_jobs"("order_id");
CREATE INDEX IF NOT EXISTS "android_iap_delivery_jobs_locked_idx"
  ON "android_iap_delivery_jobs"("locked_at");

CREATE INDEX IF NOT EXISTS "iap_android_mapping_notification_idx"
  ON "iap_android"("store_mapping_id", "last_notification_at" DESC);
CREATE INDEX IF NOT EXISTS "iap_android_current_order_idx"
  ON "iap_android"("current_order_id");
CREATE INDEX IF NOT EXISTS "iap_android_last_rtdn_event_idx"
  ON "iap_android"("last_rtdn_event_id");

ALTER TABLE "android_rtdn_configs"
  ADD CONSTRAINT "android_rtdn_configs_store_profile_id_fkey"
  FOREIGN KEY ("store_profile_id") REFERENCES "android_store_profiles"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "iap_android"
  ADD CONSTRAINT "iap_android_store_mapping_id_fkey"
  FOREIGN KEY ("store_mapping_id") REFERENCES "android_store_mappings"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "android_iap_rtdn_events"
  ADD CONSTRAINT "android_iap_rtdn_events_store_profile_id_fkey"
  FOREIGN KEY ("store_profile_id") REFERENCES "android_store_profiles"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "android_iap_rtdn_events_store_mapping_id_fkey"
  FOREIGN KEY ("store_mapping_id") REFERENCES "android_store_mappings"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "android_iap_rtdn_events_purchase_id_fkey"
  FOREIGN KEY ("purchase_id") REFERENCES "iap_android"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "android_iap_line_items"
  ADD CONSTRAINT "android_iap_line_items_purchase_id_fkey"
  FOREIGN KEY ("purchase_id") REFERENCES "iap_android"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "android_iap_orders"
  ADD CONSTRAINT "android_iap_orders_purchase_id_fkey"
  FOREIGN KEY ("purchase_id") REFERENCES "iap_android"("id")
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "android_iap_orders_store_profile_id_fkey"
  FOREIGN KEY ("store_profile_id") REFERENCES "android_store_profiles"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "android_iap_orders_store_mapping_id_fkey"
  FOREIGN KEY ("store_mapping_id") REFERENCES "android_store_mappings"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "android_iap_lifecycle_events"
  ADD CONSTRAINT "android_iap_lifecycle_events_purchase_id_fkey"
  FOREIGN KEY ("purchase_id") REFERENCES "iap_android"("id")
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "android_iap_lifecycle_events_rtdn_event_id_fkey"
  FOREIGN KEY ("rtdn_event_id") REFERENCES "android_iap_rtdn_events"("id")
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "android_iap_lifecycle_events_store_profile_id_fkey"
  FOREIGN KEY ("store_profile_id") REFERENCES "android_store_profiles"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "android_iap_lifecycle_events_store_mapping_id_fkey"
  FOREIGN KEY ("store_mapping_id") REFERENCES "android_store_mappings"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "android_iap_queue_outbox"
  ADD CONSTRAINT "android_iap_queue_outbox_rtdn_event_id_fkey"
  FOREIGN KEY ("rtdn_event_id") REFERENCES "android_iap_rtdn_events"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "android_iap_delivery_jobs"
  ADD CONSTRAINT "android_iap_delivery_jobs_lifecycle_event_id_fkey"
  FOREIGN KEY ("lifecycle_event_id") REFERENCES "android_iap_lifecycle_events"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "android_iap_delivery_jobs_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "android_iap_orders"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Bootstrap the ten Android stores already present in production. Project ID
-- and push identity come from the active GSA metadata; no private key is copied.
-- A later admin update may safely replace any of these values.
WITH store_domains("store_account_name", "tracking_host", "enabled") AS (
  VALUES
    ('Control INC', 'tracking-server.controlsolution.org', true),
    ('Novel S', 'tracking-server.novelstudio.org', true),
    ('VAT LLC', 'tracking-server.vananhtien.com', true),
    ('Mobile Clean System Lab', 'tracking-server.fmappstudio.uk', true),
    ('PHA Minh Chung', 'tracking-server.phasoft.org', true),
    ('Mobile Tools Pro', 'tracking-server.mobiletoolpro.org', true),
    ('Duong Van Luong', 'tracking-server.duysoft.org', true),
    -- No store-owned domain has been supplied for TuongvyChatgpt yet.
    ('TuongvyChatgpt', 'tracking-server.limgrow.com', false),
    ('Romaji', 'tracking-server.romajionline.date', true),
    ('Protector & Security for Mobile Ltd', 'tracking-server.mobileltd.org', true)
)
INSERT INTO "android_rtdn_configs" (
  "id",
  "store_profile_id",
  "project_id",
  "topic_name",
  "subscription_name",
  "oidc_audience",
  "push_service_account_email",
  "enabled",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid(),
  profile."id",
  credential."project_id",
  'projects/' || credential."project_id" || '/topics/limgrow-rtdn',
  'projects/' || credential."project_id" || '/subscriptions/limgrow-rtdn-system-tracking',
  'https://' || domain."tracking_host" || '/api/webhooks/google-play/rtdn',
  'limgrow-rtdn-push@' || credential."project_id" || '.iam.gserviceaccount.com',
  domain."enabled",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM store_domains AS domain
JOIN "android_store_profiles" AS profile
  ON profile."store_account_name" = domain."store_account_name"
JOIN "android_credentials" AS credential
  ON credential."store_profile_id" = profile."id"
WHERE profile."status" = 'active'
  AND credential."status" = 'active'
  AND NULLIF(BTRIM(credential."project_id"), '') IS NOT NULL
ON CONFLICT ("store_profile_id") DO UPDATE SET
  "project_id" = EXCLUDED."project_id",
  "topic_name" = EXCLUDED."topic_name",
  "subscription_name" = EXCLUDED."subscription_name",
  "oidc_audience" = EXCLUDED."oidc_audience",
  "push_service_account_email" = EXCLUDED."push_service_account_email",
  "enabled" = EXCLUDED."enabled",
  "updated_at" = CURRENT_TIMESTAMP;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'system_api') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
      "android_rtdn_configs",
      "android_iap_rtdn_events",
      "android_iap_line_items",
      "android_iap_orders",
      "android_iap_lifecycle_events",
      "android_iap_queue_outbox",
      "android_iap_delivery_jobs"
    TO system_api;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'system_worker') THEN
    GRANT SELECT, UPDATE ON TABLE
      "android_iap_rtdn_events",
      "android_iap_queue_outbox",
      "android_iap_delivery_jobs"
    TO system_worker;
  END IF;
END $$;
