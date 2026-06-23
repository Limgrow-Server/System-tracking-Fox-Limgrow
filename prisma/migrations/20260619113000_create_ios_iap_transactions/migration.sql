-- Runtime storage for verified Apple/iOS IAP transactions written by Supabase Edge Functions.
-- Mobile clients call verify-ios; only service_role can access this table via the Data API.

CREATE TABLE "public"."ios_iap_transactions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "transaction_id" TEXT NOT NULL,
  "original_transaction_id" TEXT,
  "product_id" TEXT NOT NULL,
  "user_id" TEXT,
  "bundle_id" TEXT,
  "purchase_date" TIMESTAMPTZ(6),
  "expires_date" TIMESTAMPTZ(6),
  "state" TEXT NOT NULL,
  "revenue_micros" BIGINT,
  "price_milliunits" BIGINT,
  "currency" TEXT,
  "is_trial" BOOLEAN,
  "environment" TEXT NOT NULL DEFAULT 'production',
  "raw_receipt" JSONB NOT NULL,
  "verified_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ios_iap_transactions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ios_iap_transactions_transaction_key" UNIQUE ("transaction_id"),
  CONSTRAINT "ios_iap_transactions_environment_check" CHECK ("environment" IN ('production', 'sandbox'))
);

CREATE INDEX "ios_iap_transactions_bundle_verified_idx"
ON "public"."ios_iap_transactions" ("bundle_id", "verified_at");

CREATE INDEX "ios_iap_transactions_product_verified_idx"
ON "public"."ios_iap_transactions" ("product_id", "verified_at");

CREATE INDEX "ios_iap_transactions_user_verified_idx"
ON "public"."ios_iap_transactions" ("user_id", "verified_at");

ALTER TABLE "public"."ios_iap_transactions" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."ios_iap_transactions" FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "public"."ios_iap_transactions" FROM anon;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "public"."ios_iap_transactions" FROM authenticated;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."ios_iap_transactions" TO service_role;
  END IF;
END
$$;
