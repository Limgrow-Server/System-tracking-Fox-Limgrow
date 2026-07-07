CREATE INDEX IF NOT EXISTS "android_store_mappings_status_app_name_package_idx"
  ON "android_store_mappings"("status", "app_name", "package_name", "id");

CREATE INDEX IF NOT EXISTS "android_store_mappings_profile_updated_idx"
  ON "android_store_mappings"("store_profile_id", "updated_at" DESC);

CREATE INDEX IF NOT EXISTS "android_store_mappings_updated_idx"
  ON "android_store_mappings"("updated_at" DESC);

CREATE INDEX IF NOT EXISTS "ios_store_mappings_status_app_name_bundle_idx"
  ON "ios_store_mappings"("status", "app_name", "bundle_id", "id");

CREATE INDEX IF NOT EXISTS "ios_store_mappings_profile_updated_idx"
  ON "ios_store_mappings"("store_profile_id", "updated_at" DESC);

CREATE INDEX IF NOT EXISTS "ios_store_mappings_updated_idx"
  ON "ios_store_mappings"("updated_at" DESC);

CREATE INDEX IF NOT EXISTS "android_credentials_updated_idx"
  ON "android_credentials"("updated_at" DESC);

CREATE INDEX IF NOT EXISTS "ios_credentials_updated_idx"
  ON "ios_credentials"("updated_at" DESC);

CREATE INDEX IF NOT EXISTS "ios_store_profiles_updated_idx"
  ON "ios_store_profiles"("updated_at" DESC);

DROP INDEX IF EXISTS "android_store_reviews_mapping_user_updated_idx";

CREATE INDEX IF NOT EXISTS "android_store_reviews_mapping_user_updated_idx"
  ON "android_store_reviews"("store_mapping_id", "user_comment_updated_at" DESC, "fetched_at" DESC);

DROP INDEX IF EXISTS "ios_store_reviews_app_created_idx";

CREATE INDEX IF NOT EXISTS "ios_store_reviews_app_updated_idx"
  ON "ios_store_reviews"("review_app_target_id", "review_updated_at" DESC, "review_created_at" DESC, "fetched_at" DESC);

CREATE INDEX IF NOT EXISTS "android_store_reviews_pending_reply_page_idx"
  ON "android_store_reviews"("store_mapping_id", "user_comment_updated_at" DESC, "fetched_at" DESC)
  WHERE "developer_reply_text" IS NULL;

CREATE INDEX IF NOT EXISTS "android_store_reviews_replied_page_idx"
  ON "android_store_reviews"("store_mapping_id", "user_comment_updated_at" DESC, "fetched_at" DESC)
  WHERE "developer_reply_text" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "ios_store_reviews_pending_reply_page_idx"
  ON "ios_store_reviews"("review_app_target_id", "review_updated_at" DESC, "review_created_at" DESC, "fetched_at" DESC)
  WHERE "developer_reply_text" IS NULL;

CREATE INDEX IF NOT EXISTS "ios_store_reviews_replied_page_idx"
  ON "ios_store_reviews"("review_app_target_id", "review_updated_at" DESC, "review_created_at" DESC, "fetched_at" DESC)
  WHERE "developer_reply_text" IS NOT NULL;
