-- The 3-day paid-conversion check no longer sends a device event after two hours.
-- Device identifiers are therefore optional for newly verified free trials.
ALTER TABLE "public"."ios_iap_two_hour_checks"
  ALTER COLUMN "app_instance_id" DROP NOT NULL;

-- Backfill recent production free trials so paid confirmation no longer depends
-- on a successful 2-hour GA4/Adjust delivery. One subscription transaction is
-- still represented by one idempotent check row.
INSERT INTO "public"."ios_iap_two_hour_checks" (
  "store_profile_id",
  "transaction_id",
  "original_transaction_id",
  "user_id",
  "bundle_id",
  "product_id",
  "environment",
  "check_at",
  "status",
  "conversion_check_at",
  "conversion_status",
  "raw_context"
)
SELECT
  trial."store_profile_id",
  trial."transaction_id",
  trial."original_transaction_id",
  trial."user_id",
  trial."bundle_id",
  trial."product_id",
  trial."environment",
  coalesce(trial."purchase_date", trial."verified_at", trial."created_at") + interval '3 days',
  'conversion_only',
  coalesce(trial."purchase_date", trial."verified_at", trial."created_at") + interval '3 days',
  'pending',
  jsonb_build_object(
    'pipeline', 'conversion_only',
    'source', 'migration_backfill',
    'scheduledAt', now()
  )
FROM "public"."ios_iap_transactions" trial
WHERE lower(trial."environment") = 'production'
  AND trial."subscription_group_id" IS NOT NULL
  AND coalesce(trial."purchase_date", trial."verified_at", trial."created_at") >= now() - interval '179 days'
  AND coalesce((
    trial."is_trial" = true
    OR lower(trial."offer_discount_type") = 'free_trial'
    OR (
      trial."offer_type" = 1
      AND coalesce(trial."price_milliunits", 0) = 0
      AND coalesce(trial."revenue_micros", 0) = 0
    )
  ), false)
ON CONFLICT ("transaction_id") DO UPDATE
SET
  "check_at" = CASE
    WHEN "ios_iap_two_hour_checks"."ga4_sent_at" IS NULL
      THEN excluded."conversion_check_at"
    ELSE "ios_iap_two_hour_checks"."check_at"
  END,
  "status" = CASE
    WHEN "ios_iap_two_hour_checks"."ga4_sent_at" IS NULL
      THEN 'conversion_only'
    ELSE "ios_iap_two_hour_checks"."status"
  END,
  "conversion_check_at" = coalesce(
    "ios_iap_two_hour_checks"."conversion_check_at",
    excluded."conversion_check_at"
  ),
  "conversion_status" = coalesce(
    "ios_iap_two_hour_checks"."conversion_status",
    'pending'
  ),
  "updated_at" = now();
