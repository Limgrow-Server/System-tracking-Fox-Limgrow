DROP INDEX IF EXISTS "public"."device_tokens_platform_status_seen_idx";
DROP INDEX IF EXISTS "public"."device_tokens_platform_app_id_status_seen_idx";
DROP INDEX IF EXISTS "public"."device_tokens_platform_product_app_status_seen_idx";
DROP INDEX IF EXISTS "public"."device_tokens_platform_bundle_status_seen_idx";

ALTER TABLE "public"."notification_events"
  ADD COLUMN IF NOT EXISTS "device_token_id" UUID;

UPDATE "public"."notification_events"
SET "device_token_id" = (metadata->>'deviceTokenId')::uuid
WHERE "device_token_id" IS NULL
  AND metadata ? 'deviceTokenId'
  AND (metadata->>'deviceTokenId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

CREATE INDEX IF NOT EXISTS "notification_events_token_sent_created_idx"
  ON "public"."notification_events" ("device_token_id", "created_at" DESC)
  WHERE "event_type" = 'fcm_sent'
    AND "status" = 'sent'
    AND "device_token_id" IS NOT NULL;
