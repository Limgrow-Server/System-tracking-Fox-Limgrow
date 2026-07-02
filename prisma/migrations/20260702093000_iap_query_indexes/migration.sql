CREATE INDEX IF NOT EXISTS iap_android_package_profile_verified_idx
  ON public.iap_android (package_name, store_profile_id, verified_at);

CREATE INDEX IF NOT EXISTS iap_android_package_profile_purchase_idx
  ON public.iap_android (package_name, store_profile_id, purchase_date);

CREATE INDEX IF NOT EXISTS ios_iap_transactions_bundle_profile_verified_idx
  ON public.ios_iap_transactions (bundle_id, store_profile_id, verified_at);

CREATE INDEX IF NOT EXISTS ios_iap_transactions_bundle_profile_purchase_idx
  ON public.ios_iap_transactions (bundle_id, store_profile_id, purchase_date);
