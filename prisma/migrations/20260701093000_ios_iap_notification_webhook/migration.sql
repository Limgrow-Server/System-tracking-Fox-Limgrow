-- Add App Store Server Notifications V2 intake and transaction fields used for
-- trial conversion/refund analytics.

ALTER TABLE "ios_iap_transactions"
ADD COLUMN IF NOT EXISTS "web_order_line_item_id" TEXT,
ADD COLUMN IF NOT EXISTS "subscription_group_id" TEXT,
ADD COLUMN IF NOT EXISTS "transaction_reason" TEXT,
ADD COLUMN IF NOT EXISTS "offer_type" INTEGER,
ADD COLUMN IF NOT EXISTS "offer_discount_type" TEXT,
ADD COLUMN IF NOT EXISTS "offer_period" TEXT,
ADD COLUMN IF NOT EXISTS "billing_plan_type" TEXT,
ADD COLUMN IF NOT EXISTS "storefront" TEXT,
ADD COLUMN IF NOT EXISTS "storefront_id" TEXT,
ADD COLUMN IF NOT EXISTS "app_transaction_id" TEXT,
ADD COLUMN IF NOT EXISTS "revocation_date" TIMESTAMPTZ(6),
ADD COLUMN IF NOT EXISTS "revocation_reason" INTEGER,
ADD COLUMN IF NOT EXISTS "revocation_type" TEXT,
ADD COLUMN IF NOT EXISTS "revocation_percentage" INTEGER;

CREATE INDEX IF NOT EXISTS "ios_iap_transactions_original_purchase_idx"
ON "ios_iap_transactions"("original_transaction_id", "purchase_date");

CREATE INDEX IF NOT EXISTS "ios_iap_transactions_offer_purchase_idx"
ON "ios_iap_transactions"("offer_discount_type", "purchase_date");

CREATE INDEX IF NOT EXISTS "ios_iap_transactions_revocation_date_idx"
ON "ios_iap_transactions"("revocation_date");

CREATE TABLE IF NOT EXISTS "ios_iap_notification_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "notification_uuid" TEXT NOT NULL,
    "notification_type" TEXT NOT NULL,
    "subtype" TEXT,
    "environment" TEXT,
    "bundle_id" TEXT,
    "app_apple_id" TEXT,
    "original_transaction_id" TEXT,
    "transaction_id" TEXT,
    "signed_date" TIMESTAMPTZ(6),
    "status" TEXT NOT NULL DEFAULT 'processing',
    "error_message" TEXT,
    "raw_payload" JSONB NOT NULL,
    "decoded_payload" JSONB,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "store_profile_id" UUID,

    CONSTRAINT "ios_iap_notification_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ios_iap_notification_events_notification_uuid_key"
ON "ios_iap_notification_events"("notification_uuid");

CREATE INDEX IF NOT EXISTS "ios_iap_notification_events_type_received_idx"
ON "ios_iap_notification_events"("notification_type", "received_at");

CREATE INDEX IF NOT EXISTS "ios_iap_notification_events_bundle_received_idx"
ON "ios_iap_notification_events"("bundle_id", "received_at");

CREATE INDEX IF NOT EXISTS "ios_iap_notification_events_original_idx"
ON "ios_iap_notification_events"("original_transaction_id");

CREATE INDEX IF NOT EXISTS "ios_iap_notification_events_transaction_idx"
ON "ios_iap_notification_events"("transaction_id");

CREATE INDEX IF NOT EXISTS "ios_iap_notification_events_status_received_idx"
ON "ios_iap_notification_events"("status", "received_at");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ios_iap_notification_events_store_profile_id_fkey'
  ) THEN
    ALTER TABLE "ios_iap_notification_events"
    ADD CONSTRAINT "ios_iap_notification_events_store_profile_id_fkey"
    FOREIGN KEY ("store_profile_id")
    REFERENCES "ios_store_profiles"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
  END IF;
END $$;
