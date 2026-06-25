ALTER TABLE "device_tokens"
ADD COLUMN "app_identifier" TEXT,
ADD COLUMN "device_type" TEXT;

UPDATE "device_tokens"
SET "app_identifier" = CASE
  WHEN "platform" = 'android' THEN COALESCE(NULLIF(lower(trim("package_name")), ''), NULLIF(trim("product_app_id"), ''), NULLIF(trim("app_id"), ''))
  WHEN "platform" = 'ios' THEN COALESCE(NULLIF(trim("bundle_id"), ''), NULLIF(trim("product_app_id"), ''), NULLIF(trim("app_id"), ''))
  ELSE COALESCE(NULLIF(lower(trim("package_name")), ''), NULLIF(trim("bundle_id"), ''), NULLIF(trim("product_app_id"), ''), NULLIF(trim("app_id"), ''))
END
WHERE "app_identifier" IS NULL;

CREATE INDEX "device_tokens_identifier_platform_status_idx"
ON "device_tokens"("platform", "app_identifier", "status");
