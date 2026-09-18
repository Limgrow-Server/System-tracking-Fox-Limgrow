ALTER TABLE public.ios_store_mappings
ADD COLUMN IF NOT EXISTS firebase_app_id TEXT,
ADD COLUMN IF NOT EXISTS firebase_analytics_api_secret TEXT;
