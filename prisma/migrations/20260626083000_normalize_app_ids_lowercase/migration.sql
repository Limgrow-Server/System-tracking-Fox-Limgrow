CREATE OR REPLACE FUNCTION normalize_tracking_app_id(value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(lower(regexp_replace(btrim(value), '\s+', '', 'g')), '')
$$;

CREATE OR REPLACE FUNCTION normalize_tracking_scope_values(input_values TEXT[])
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    array_agg(normalized.value ORDER BY normalized.value),
    ARRAY[]::TEXT[]
  )
  FROM (
    SELECT DISTINCT lower(btrim(value)) AS value
    FROM unnest(COALESCE(input_values, ARRAY[]::TEXT[])) AS value
    WHERE btrim(value) <> ''
  ) AS normalized
$$;

UPDATE android_store_mappings
SET
  app_id = normalize_tracking_app_id(app_id),
  updated_at = now()
WHERE app_id IS DISTINCT FROM normalize_tracking_app_id(app_id);

UPDATE ios_store_mappings
SET
  app_id = normalize_tracking_app_id(app_id),
  updated_at = now()
WHERE app_id IS DISTINCT FROM normalize_tracking_app_id(app_id);

UPDATE device_tokens
SET
  app_id = normalize_tracking_app_id(app_id),
  product_app_id = normalize_tracking_app_id(product_app_id),
  updated_at = now()
WHERE
  app_id IS DISTINCT FROM normalize_tracking_app_id(app_id)
  OR product_app_id IS DISTINCT FROM normalize_tracking_app_id(product_app_id);

UPDATE notification_jobs
SET
  app_id = normalize_tracking_app_id(app_id),
  updated_at = now()
WHERE app_id IS DISTINCT FROM normalize_tracking_app_id(app_id);

UPDATE notification_schedules
SET
  app_id = normalize_tracking_app_id(app_id),
  updated_at = now()
WHERE app_id IS DISTINCT FROM normalize_tracking_app_id(app_id);

UPDATE team_members
SET
  app_scope = normalize_tracking_scope_values(app_scope),
  store_scope = normalize_tracking_scope_values(store_scope),
  updated_at = now()
WHERE
  app_scope IS DISTINCT FROM normalize_tracking_scope_values(app_scope)
  OR store_scope IS DISTINCT FROM normalize_tracking_scope_values(store_scope);

CREATE OR REPLACE FUNCTION set_android_store_mapping_lowercase_app_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.app_id = normalize_tracking_app_id(NEW.app_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_android_store_mapping_app_id ON android_store_mappings;
CREATE TRIGGER normalize_android_store_mapping_app_id
BEFORE INSERT OR UPDATE OF app_id ON android_store_mappings
FOR EACH ROW
EXECUTE FUNCTION set_android_store_mapping_lowercase_app_id();

CREATE OR REPLACE FUNCTION set_ios_store_mapping_lowercase_app_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.app_id = normalize_tracking_app_id(NEW.app_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_ios_store_mapping_app_id ON ios_store_mappings;
CREATE TRIGGER normalize_ios_store_mapping_app_id
BEFORE INSERT OR UPDATE OF app_id ON ios_store_mappings
FOR EACH ROW
EXECUTE FUNCTION set_ios_store_mapping_lowercase_app_id();

CREATE OR REPLACE FUNCTION set_device_token_lowercase_app_ids()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.app_id = normalize_tracking_app_id(NEW.app_id);
  NEW.product_app_id = normalize_tracking_app_id(NEW.product_app_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_device_token_app_ids ON device_tokens;
CREATE TRIGGER normalize_device_token_app_ids
BEFORE INSERT OR UPDATE OF app_id, product_app_id ON device_tokens
FOR EACH ROW
EXECUTE FUNCTION set_device_token_lowercase_app_ids();

CREATE OR REPLACE FUNCTION set_notification_job_lowercase_app_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.app_id = normalize_tracking_app_id(NEW.app_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_notification_job_app_id ON notification_jobs;
CREATE TRIGGER normalize_notification_job_app_id
BEFORE INSERT OR UPDATE OF app_id ON notification_jobs
FOR EACH ROW
EXECUTE FUNCTION set_notification_job_lowercase_app_id();

CREATE OR REPLACE FUNCTION set_notification_schedule_lowercase_app_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.app_id = normalize_tracking_app_id(NEW.app_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_notification_schedule_app_id ON notification_schedules;
CREATE TRIGGER normalize_notification_schedule_app_id
BEFORE INSERT OR UPDATE OF app_id ON notification_schedules
FOR EACH ROW
EXECUTE FUNCTION set_notification_schedule_lowercase_app_id();

CREATE OR REPLACE FUNCTION set_team_member_lowercase_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.app_scope = normalize_tracking_scope_values(NEW.app_scope);
  NEW.store_scope = normalize_tracking_scope_values(NEW.store_scope);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_team_member_scope ON team_members;
CREATE TRIGGER normalize_team_member_scope
BEFORE INSERT OR UPDATE OF app_scope, store_scope ON team_members
FOR EACH ROW
EXECUTE FUNCTION set_team_member_lowercase_scope();
