CREATE TABLE IF NOT EXISTS public.mobile_ingest_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint text NOT NULL,
  platform text,
  action text,
  dedupe_key text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  locked_at timestamp(6) with time zone,
  locked_by text,
  next_attempt_at timestamp(6) with time zone NOT NULL DEFAULT now(),
  processed_at timestamp(6) with time zone,
  result_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_error text,
  created_at timestamp(6) with time zone NOT NULL DEFAULT now(),
  updated_at timestamp(6) with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS mobile_ingest_events_dedupe_key_key
  ON public.mobile_ingest_events (dedupe_key);

CREATE INDEX IF NOT EXISTS mobile_ingest_events_status_next_idx
  ON public.mobile_ingest_events (status, next_attempt_at);

CREATE INDEX IF NOT EXISTS mobile_ingest_events_endpoint_status_next_idx
  ON public.mobile_ingest_events (endpoint, status, next_attempt_at);

CREATE INDEX IF NOT EXISTS mobile_ingest_events_locked_idx
  ON public.mobile_ingest_events (locked_at);

CREATE INDEX IF NOT EXISTS mobile_ingest_events_updated_idx
  ON public.mobile_ingest_events (updated_at);

ALTER TABLE public.mobile_ingest_events ENABLE ROW LEVEL SECURITY;
