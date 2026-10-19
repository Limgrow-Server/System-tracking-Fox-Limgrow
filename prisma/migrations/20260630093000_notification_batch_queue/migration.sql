create table if not exists public.notification_job_batches (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.notification_jobs(id) on delete cascade,
  batch_index integer not null,
  target_values text[] not null default array[]::text[],
  status text not null default 'queued',
  attempt_count integer not null default 0,
  max_attempts integer not null default 3,
  locked_at timestamptz,
  locked_by text,
  next_attempt_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  sent_count integer not null default 0,
  error_count integer not null default 0,
  last_error text,
  result_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_job_batches_job_batch_key unique (job_id, batch_index)
);

create index if not exists notification_job_batches_job_status_idx
  on public.notification_job_batches(job_id, status);

create index if not exists notification_job_batches_status_next_idx
  on public.notification_job_batches(status, next_attempt_at);

create index if not exists notification_job_batches_locked_idx
  on public.notification_job_batches(locked_at);
