-- CreateTable
CREATE TABLE "iap_android" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "store_profile_id" UUID,
    "package_name" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "purchase_kind" TEXT NOT NULL,
    "purchase_token" TEXT NOT NULL,
    "order_id" TEXT,
    "linked_purchase_token" TEXT,
    "state" TEXT NOT NULL,
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "consumed" BOOLEAN,
    "auto_renewing" BOOLEAN,
    "purchase_date" TIMESTAMPTZ(6),
    "expires_date" TIMESTAMPTZ(6),
    "revenue_micros" BIGINT,
    "currency" TEXT,
    "region_code" TEXT,
    "base_plan_id" TEXT,
    "offer_id" TEXT,
    "is_test_purchase" BOOLEAN NOT NULL DEFAULT false,
    "raw_receipt" JSONB,
    "verified_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "iap_android_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: Idempotency key
CREATE UNIQUE INDEX "iap_android_package_name_purchase_token_key"
    ON "iap_android"("package_name", "purchase_token");

-- CreateIndex: Query by app + SKU
CREATE INDEX "iap_android_package_name_product_id_idx"
    ON "iap_android"("package_name", "product_id");

-- CreateIndex: Filter by state + time
CREATE INDEX "iap_android_state_purchase_date_idx"
    ON "iap_android"("state", "purchase_date");

-- CreateIndex: Join with store profile
CREATE INDEX "iap_android_store_profile_id_idx"
    ON "iap_android"("store_profile_id");

-- AddForeignKey
ALTER TABLE "iap_android"
    ADD CONSTRAINT "iap_android_store_profile_id_fkey"
    FOREIGN KEY ("store_profile_id")
    REFERENCES "android_store_profiles"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS: Bật Row Level Security
ALTER TABLE "iap_android" ENABLE ROW LEVEL SECURITY;

-- RLS: Chặn anon và authenticated truy cập trực tiếp
-- Edge Function dùng service_role nên bypass RLS
REVOKE ALL ON "iap_android" FROM anon, authenticated;
GRANT ALL ON "iap_android" TO service_role;
