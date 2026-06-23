ALTER TABLE "device_tokens"
ADD COLUMN IF NOT EXISTS "app_id" TEXT;

UPDATE "device_tokens"
SET "app_id" = NULLIF(BTRIM("product_app_id"), '')
WHERE "app_id" IS NULL
  AND NULLIF(BTRIM("product_app_id"), '') IS NOT NULL;

CREATE INDEX IF NOT EXISTS "device_tokens_app_id_platform_status_idx"
ON "device_tokens"("app_id", "platform", "status");
