CREATE INDEX IF NOT EXISTS ios_iap_transactions_bundle_env_profile_verified_idx
  ON public.ios_iap_transactions (bundle_id, environment, store_profile_id, verified_at);

CREATE INDEX IF NOT EXISTS ios_iap_transactions_bundle_env_profile_purchase_idx
  ON public.ios_iap_transactions (bundle_id, environment, store_profile_id, purchase_date);

CREATE INDEX IF NOT EXISTS ios_iap_transactions_bundle_env_profile_state_idx
  ON public.ios_iap_transactions (bundle_id, environment, store_profile_id, state);

CREATE INDEX IF NOT EXISTS ios_iap_notification_events_bundle_env_profile_received_idx
  ON public.ios_iap_notification_events (bundle_id, environment, store_profile_id, received_at);

CREATE INDEX IF NOT EXISTS ios_iap_notification_events_bundle_env_profile_status_idx
  ON public.ios_iap_notification_events (bundle_id, environment, store_profile_id, status);
