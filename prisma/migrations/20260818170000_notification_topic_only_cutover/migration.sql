-- Topic-only notification cutover.
-- Preserve legacy device history, but pause all unfinished device work and reject
-- any new device-targeted notification rows at the database boundary.

UPDATE public.notification_job_batches AS batches
SET
  status = 'paused',
  locked_at = NULL,
  locked_by = NULL,
  last_error = COALESCE(
    batches.last_error,
    'Paused by topic-only notification cutover.'
  ),
  updated_at = NOW()
FROM public.notification_jobs AS jobs
WHERE jobs.id = batches.job_id
  AND jobs.target_type = 'device'
  AND batches.status IN ('queued', 'retrying', 'processing', 'paused');

UPDATE public.notification_jobs
SET
  status = 'paused',
  updated_at = NOW()
WHERE target_type = 'device'
  AND status NOT IN ('sent', 'sent_with_issues', 'failed', 'paused');

UPDATE public.notification_schedules
SET
  status = 'paused',
  last_status = 'topic_migration_required',
  last_error = 'Legacy device schedule was paused. Recreate it as a locale-topic schedule.',
  updated_at = NOW()
WHERE target_type = 'device'
  AND status NOT IN ('completed', 'paused');

ALTER TABLE public.notification_jobs
  ADD CONSTRAINT notification_jobs_topic_only_check
  CHECK (target_type = 'topic') NOT VALID;

ALTER TABLE public.notification_schedules
  ADD CONSTRAINT notification_schedules_topic_only_check
  CHECK (target_type = 'topic') NOT VALID;

ALTER TABLE public.notification_events
  ADD CONSTRAINT notification_events_topic_only_check
  CHECK (target_type IS NULL OR target_type = 'topic') NOT VALID;
