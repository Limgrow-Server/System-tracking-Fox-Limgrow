-- RTDN is currently configured end-to-end only for Control INC. Keep the
-- remaining pre-created store rows for future rollout, but do not accept their
-- Pub/Sub pushes until each store has been configured and tested explicitly.
BEGIN;

-- Future store configurations must be explicitly enabled after their Google
-- Cloud and Play Console resources have passed end-to-end testing.
ALTER TABLE public.android_rtdn_configs
  ALTER COLUMN enabled SET DEFAULT false;

UPDATE public.android_rtdn_configs AS config
SET
  enabled = (profile.store_account_name = 'Control INC'),
  updated_at = now()
FROM public.android_store_profiles AS profile
WHERE profile.id = config.store_profile_id
  AND config.enabled IS DISTINCT FROM (profile.store_account_name = 'Control INC');

DO $$
DECLARE
  enabled_count integer;
  control_count integer;
BEGIN
  SELECT count(*) INTO enabled_count
  FROM public.android_rtdn_configs
  WHERE enabled = true;

  SELECT count(*) INTO control_count
  FROM public.android_rtdn_configs AS config
  JOIN public.android_store_profiles AS profile
    ON profile.id = config.store_profile_id
  WHERE config.enabled = true
    AND profile.store_account_name = 'Control INC';

  IF enabled_count <> 1 OR control_count <> 1 THEN
    RAISE EXCEPTION
      'Expected exactly one enabled Android RTDN config for Control INC; enabled=%, control=%',
      enabled_count,
      control_count;
  END IF;
END
$$;

COMMIT;
