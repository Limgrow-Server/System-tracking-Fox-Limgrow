CREATE TABLE IF NOT EXISTS "android_store_review_reply_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "store_mapping_id" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "reply_text" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_by" TEXT,
    "updated_by" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "android_store_review_reply_templates_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "android_store_review_reply_templates_rating_check" CHECK ("rating" BETWEEN 1 AND 5)
);

CREATE UNIQUE INDEX IF NOT EXISTS "android_store_review_reply_templates_mapping_rating_key"
    ON "android_store_review_reply_templates"("store_mapping_id", "rating");

CREATE INDEX IF NOT EXISTS "android_store_review_reply_templates_mapping_active_idx"
    ON "android_store_review_reply_templates"("store_mapping_id", "is_active");

DO $$
BEGIN
  ALTER TABLE "android_store_review_reply_templates"
    ADD CONSTRAINT "android_store_review_reply_templates_store_mapping_id_fkey"
    FOREIGN KEY ("store_mapping_id")
    REFERENCES "android_store_mappings"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "android_store_review_reply_templates" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "android_store_review_reply_templates" FROM anon, authenticated;
GRANT ALL ON TABLE "android_store_review_reply_templates" TO service_role;
