ALTER TABLE "android_store_reviews"
  ADD COLUMN IF NOT EXISTS "device_metadata" JSONB;

WITH latest_user_comments AS (
  SELECT
    review."id",
    latest_comment."user_comment"
  FROM "android_store_reviews" AS review
  CROSS JOIN LATERAL (
    SELECT comment_item->'userComment' AS "user_comment"
    FROM jsonb_array_elements(
      COALESCE(review."raw_review"->'comments', '[]'::jsonb)
    ) AS comment_item
    WHERE comment_item ? 'userComment'
    ORDER BY
      CASE
        WHEN comment_item->'userComment'->'lastModified'->>'seconds' ~ '^[0-9]+$'
          THEN (comment_item->'userComment'->'lastModified'->>'seconds')::bigint
        ELSE 0
      END DESC,
      CASE
        WHEN comment_item->'userComment'->'lastModified'->>'nanos' ~ '^[0-9]+$'
          THEN (comment_item->'userComment'->'lastModified'->>'nanos')::integer
        ELSE 0
      END DESC
    LIMIT 1
  ) AS latest_comment
)
UPDATE "android_store_reviews" AS review
SET "device_metadata" = latest_user_comments."user_comment"->'deviceMetadata'
FROM latest_user_comments
WHERE review."id" = latest_user_comments."id"
  AND review."device_metadata" IS NULL
  AND latest_user_comments."user_comment" ? 'deviceMetadata';
