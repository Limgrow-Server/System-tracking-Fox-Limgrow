-- Google acknowledgementState does not disclose whether the caller was the
-- mobile app or another server. Preserve NULL for historical/unknown sources.
ALTER TABLE "iap_android"
  ADD COLUMN IF NOT EXISTS "acknowledgement_source" TEXT,
  ADD COLUMN IF NOT EXISTS "acknowledged_at" TIMESTAMPTZ(6);
