CREATE INDEX IF NOT EXISTS device_tokens_platform_identifier_status_seen_idx
  ON public.device_tokens (platform, app_identifier, status, last_seen_at);

CREATE INDEX IF NOT EXISTS device_tokens_platform_app_id_status_seen_idx
  ON public.device_tokens (platform, app_id, status, last_seen_at);

CREATE INDEX IF NOT EXISTS device_tokens_platform_product_app_status_seen_idx
  ON public.device_tokens (platform, product_app_id, status, last_seen_at);

CREATE INDEX IF NOT EXISTS device_tokens_platform_package_status_seen_idx
  ON public.device_tokens (platform, package_name, status, last_seen_at);

CREATE INDEX IF NOT EXISTS device_tokens_platform_bundle_status_seen_idx
  ON public.device_tokens (platform, bundle_id, status, last_seen_at);

CREATE INDEX IF NOT EXISTS device_tokens_platform_store_status_idx
  ON public.device_tokens (platform, store_account_name, status);

CREATE INDEX IF NOT EXISTS notification_jobs_mapping_platform_created_idx
  ON public.notification_jobs (app_mapping_id, platform, created_at);

CREATE INDEX IF NOT EXISTS notification_jobs_package_platform_created_idx
  ON public.notification_jobs (package_name, platform, created_at);

CREATE INDEX IF NOT EXISTS notification_jobs_bundle_platform_created_idx
  ON public.notification_jobs (bundle_id, platform, created_at);

CREATE INDEX IF NOT EXISTS notification_schedules_mapping_platform_created_idx
  ON public.notification_schedules (app_mapping_id, platform, created_at);

CREATE INDEX IF NOT EXISTS notification_schedules_package_platform_created_idx
  ON public.notification_schedules (package_name, platform, created_at);

CREATE INDEX IF NOT EXISTS notification_schedules_bundle_platform_created_idx
  ON public.notification_schedules (bundle_id, platform, created_at);
