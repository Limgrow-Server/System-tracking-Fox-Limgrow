ALTER TABLE "ios_iap_transactions"
  ADD COLUMN IF NOT EXISTS "adjust_adid" TEXT,
  ADD COLUMN IF NOT EXISTS "idfa" TEXT,
  ADD COLUMN IF NOT EXISTS "idfv" TEXT;

ALTER TABLE "ios_iap_two_hour_checks"
  ADD COLUMN IF NOT EXISTS "adjust_adid" TEXT,
  ADD COLUMN IF NOT EXISTS "idfa" TEXT,
  ADD COLUMN IF NOT EXISTS "idfv" TEXT;
