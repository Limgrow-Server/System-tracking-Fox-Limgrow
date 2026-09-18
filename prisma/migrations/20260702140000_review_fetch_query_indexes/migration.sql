CREATE INDEX IF NOT EXISTS review_fetch_runs_app_platform_scan_status_idx
  ON public.review_fetch_runs (review_app_target_id, platform, scan_mode, status);

CREATE INDEX IF NOT EXISTS review_fetch_runs_platform_status_next_created_idx
  ON public.review_fetch_runs (platform, status, next_attempt_at, created_at);
