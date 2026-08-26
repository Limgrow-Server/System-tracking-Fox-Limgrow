-- Preserve Google pending-refund review tokens as restricted operational data
-- and make paid-delivery eligibility independent from mutable order state.

ALTER TABLE "android_iap_rtdn_events"
  ADD COLUMN IF NOT EXISTS "pending_refund_token_encrypted" JSONB,
  ADD COLUMN IF NOT EXISTS "requires_action" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "action_status" TEXT,
  ADD COLUMN IF NOT EXISTS "action_due_at" TIMESTAMPTZ(6);

UPDATE "android_iap_rtdn_events"
SET
  "requires_action" = true,
  "action_status" = COALESCE("action_status", 'missing_review_token'),
  "action_due_at" = COALESCE("action_due_at", "event_time" + INTERVAL '24 hours'),
  "raw_payload" = jsonb_set(
    "raw_payload" #- '{pendingRefundReviewNotification,pendingRefundToken}',
    '{pendingRefundReviewNotification,pendingRefundTokenStored}',
    'false'::jsonb,
    true
  )
WHERE "notification_kind" = 'pending_refund';

ALTER TABLE "android_iap_rtdn_events"
  DROP CONSTRAINT IF EXISTS "android_iap_rtdn_events_action_status_check";
ALTER TABLE "android_iap_rtdn_events"
  ADD CONSTRAINT "android_iap_rtdn_events_action_status_check"
  CHECK (
    "action_status" IS NULL
    OR "action_status" IN ('pending_manual_review', 'missing_review_token', 'reviewed')
  );

CREATE INDEX IF NOT EXISTS "android_iap_rtdn_events_action_due_idx"
  ON "android_iap_rtdn_events"("requires_action", "action_due_at");

ALTER TABLE "android_iap_delivery_jobs"
  ADD COLUMN IF NOT EXISTS "amount_micros" BIGINT,
  ADD COLUMN IF NOT EXISTS "currency" TEXT,
  ADD COLUMN IF NOT EXISTS "purchase_occurred_at" TIMESTAMPTZ(6);

UPDATE "android_iap_delivery_jobs" AS job
SET
  "amount_micros" = COALESCE(job."amount_micros", lifecycle."amount_micros"),
  "currency" = COALESCE(job."currency", lifecycle."currency"),
  "purchase_occurred_at" = COALESCE(
    job."purchase_occurred_at",
    lifecycle."occurred_at"
  )
FROM "android_iap_lifecycle_events" AS lifecycle
WHERE
  lifecycle."id" = job."lifecycle_event_id"
  AND lifecycle."amount_micros" > 0;

ALTER TABLE "android_iap_delivery_jobs"
  DROP CONSTRAINT IF EXISTS "android_iap_delivery_jobs_snapshot_amount_check";
ALTER TABLE "android_iap_delivery_jobs"
  ADD CONSTRAINT "android_iap_delivery_jobs_snapshot_amount_check"
  CHECK ("amount_micros" IS NULL OR "amount_micros" > 0);
