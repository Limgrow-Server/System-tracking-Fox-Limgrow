-- Track the "2 hours after purchase" GA4/Firebase Analytics event per iOS
-- purchase without exposing the GA4 Measurement Protocol secret to clients.

CREATE TABLE IF NOT EXISTS public.ios_iap_two_hour_checks (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    store_profile_id UUID,
    transaction_id TEXT NOT NULL,
    original_transaction_id TEXT,
    user_id TEXT,
    bundle_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    environment TEXT NOT NULL DEFAULT 'production',
    app_instance_id TEXT NOT NULL,
    firebase_app_id TEXT,
    ga4_event_name TEXT NOT NULL DEFAULT 'purchase_2hour',
    check_at TIMESTAMPTZ(6) NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    renewed BOOLEAN,
    renewal_status TEXT,
    ga4_sent_at TIMESTAMPTZ(6),
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    raw_context JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT ios_iap_two_hour_checks_pkey PRIMARY KEY (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS ios_iap_two_hour_checks_transaction_key
ON public.ios_iap_two_hour_checks (transaction_id);

CREATE INDEX IF NOT EXISTS ios_iap_two_hour_checks_status_check_idx
ON public.ios_iap_two_hour_checks (status, check_at);

CREATE INDEX IF NOT EXISTS ios_iap_two_hour_checks_pending_check_idx
ON public.ios_iap_two_hour_checks (check_at)
WHERE status IN ('pending', 'retrying');

CREATE INDEX IF NOT EXISTS ios_iap_two_hour_checks_bundle_env_profile_check_idx
ON public.ios_iap_two_hour_checks (bundle_id, environment, store_profile_id, check_at);

CREATE INDEX IF NOT EXISTS ios_iap_two_hour_checks_original_idx
ON public.ios_iap_two_hour_checks (original_transaction_id);

CREATE INDEX IF NOT EXISTS ios_iap_two_hour_checks_store_profile_check_idx
ON public.ios_iap_two_hour_checks (store_profile_id, check_at);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ios_iap_two_hour_checks_store_profile_id_fkey'
  ) THEN
    ALTER TABLE public.ios_iap_two_hour_checks
    ADD CONSTRAINT ios_iap_two_hour_checks_store_profile_id_fkey
    FOREIGN KEY (store_profile_id)
    REFERENCES public.ios_store_profiles(id)
    ON DELETE SET NULL
    ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE public.ios_iap_two_hour_checks ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.broadcast_ios_iap_two_hour_check_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, realtime
AS $$
DECLARE
  app_identifier text;
  changed_id text;
  store_profile_id text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    app_identifier := OLD.bundle_id;
    changed_id := OLD.id::text;
    store_profile_id := OLD.store_profile_id::text;
  ELSE
    app_identifier := NEW.bundle_id;
    changed_id := NEW.id::text;
    store_profile_id := NEW.store_profile_id::text;
  END IF;

  IF nullif(btrim(app_identifier), '') IS NULL THEN
    RETURN NULL;
  END IF;

  IF to_regprocedure('realtime.send(jsonb,text,text,boolean)') IS NULL THEN
    RETURN NULL;
  END IF;

  PERFORM realtime.send(
    jsonb_build_object(
      'id', changed_id,
      'identifier', app_identifier,
      'operation', TG_OP,
      'platform', 'ios',
      'storeProfileId', store_profile_id,
      'table', TG_TABLE_NAME,
      'updatedAt', clock_timestamp()
    ),
    'changed',
    'iap-detail:ios:' || app_identifier,
    true
  );

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.broadcast_ios_iap_two_hour_check_change() FROM PUBLIC;

DROP TRIGGER IF EXISTS ios_iap_two_hour_checks_detail_realtime ON public.ios_iap_two_hour_checks;
CREATE TRIGGER ios_iap_two_hour_checks_detail_realtime
AFTER INSERT OR UPDATE OR DELETE ON public.ios_iap_two_hour_checks
FOR EACH ROW
EXECUTE FUNCTION public.broadcast_ios_iap_two_hour_check_change();
