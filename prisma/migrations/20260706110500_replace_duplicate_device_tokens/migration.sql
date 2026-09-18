WITH ranked_device_tokens AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY
        platform,
        device_id,
        COALESCE(app_id, ''),
        COALESCE(product_app_id, ''),
        COALESCE(app_identifier, '')
      ORDER BY
        last_seen_at DESC NULLS LAST,
        updated_at DESC NULLS LAST,
        created_at DESC NULLS LAST,
        id DESC
    ) AS row_rank
  FROM public.device_tokens
  WHERE status = 'active'
)
UPDATE public.device_tokens AS tokens
SET
  status = 'replaced',
  updated_at = now()
FROM ranked_device_tokens AS ranked
WHERE tokens.id = ranked.id
  AND ranked.row_rank > 1;

WITH ranked_device_tokens AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY
        platform,
        device_id,
        app_identifier
      ORDER BY
        last_seen_at DESC NULLS LAST,
        updated_at DESC NULLS LAST,
        created_at DESC NULLS LAST,
        id DESC
    ) AS row_rank
  FROM public.device_tokens
  WHERE status = 'active'
    AND app_identifier IS NOT NULL
)
UPDATE public.device_tokens AS tokens
SET
  status = 'replaced',
  updated_at = now()
FROM ranked_device_tokens AS ranked
WHERE tokens.id = ranked.id
  AND ranked.row_rank > 1;

WITH ranked_device_tokens AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY
        platform,
        device_id,
        package_name
      ORDER BY
        last_seen_at DESC NULLS LAST,
        updated_at DESC NULLS LAST,
        created_at DESC NULLS LAST,
        id DESC
    ) AS row_rank
  FROM public.device_tokens
  WHERE status = 'active'
    AND package_name IS NOT NULL
)
UPDATE public.device_tokens AS tokens
SET
  status = 'replaced',
  updated_at = now()
FROM ranked_device_tokens AS ranked
WHERE tokens.id = ranked.id
  AND ranked.row_rank > 1;

WITH ranked_device_tokens AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY
        platform,
        device_id,
        bundle_id
      ORDER BY
        last_seen_at DESC NULLS LAST,
        updated_at DESC NULLS LAST,
        created_at DESC NULLS LAST,
        id DESC
    ) AS row_rank
  FROM public.device_tokens
  WHERE status = 'active'
    AND bundle_id IS NOT NULL
)
UPDATE public.device_tokens AS tokens
SET
  status = 'replaced',
  updated_at = now()
FROM ranked_device_tokens AS ranked
WHERE tokens.id = ranked.id
  AND ranked.row_rank > 1;
