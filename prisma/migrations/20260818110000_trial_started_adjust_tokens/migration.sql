BEGIN;

ALTER TABLE "android_store_mappings"
  ADD COLUMN IF NOT EXISTS "adjust_trial_started_event_token" TEXT;

ALTER TABLE "ios_store_mappings"
  ADD COLUMN IF NOT EXISTS "adjust_trial_started_event_token" TEXT;

COMMIT;
