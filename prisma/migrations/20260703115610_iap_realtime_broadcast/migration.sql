-- Broadcast lightweight IAP detail update events without exposing raw receipts
-- or App Store signed payloads to browser Realtime clients.

CREATE OR REPLACE FUNCTION public.can_listen_iap_detail_topic(
  p_auth_user_id uuid,
  p_topic text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH parsed AS (
    SELECT
      split_part(p_topic, ':', 1) AS topic_prefix,
      split_part(p_topic, ':', 2) AS app_platform,
      split_part(p_topic, ':', 3) AS app_identifier
  )
  SELECT EXISTS (
    SELECT 1
    FROM public.team_members tm
    CROSS JOIN parsed
    WHERE tm.auth_user_id = p_auth_user_id
      AND tm.status = 'active'::team_member_status
      AND parsed.topic_prefix = 'iap-detail'
      AND parsed.app_platform IN ('android', 'ios')
      AND parsed.app_identifier <> ''
      AND (
        tm.role = 'Admin'::staff_role
        OR tm.global_access
        OR EXISTS (
          SELECT 1
          FROM public.android_store_mappings m
          WHERE parsed.app_platform = 'android'
            AND m.status = 'active'::mapping_status
            AND m.package_name = parsed.app_identifier
            AND (
              EXISTS (
                SELECT 1
                FROM unnest(tm.app_scope) AS scope_value(value)
                WHERE lower(scope_value.value) IN (
                  lower(m.id::text),
                  lower(coalesce(m.app_id, '')),
                  lower(m.app_name),
                  lower(m.package_name)
                )
              )
              OR EXISTS (
                SELECT 1
                FROM unnest(tm.store_scope) AS scope_value(value)
                WHERE lower(scope_value.value) IN (
                  lower(m.store_profile_id::text),
                  lower(m.store_account_name)
                )
              )
            )
        )
        OR EXISTS (
          SELECT 1
          FROM public.ios_store_mappings m
          WHERE parsed.app_platform = 'ios'
            AND m.status = 'active'::mapping_status
            AND m.bundle_id = parsed.app_identifier
            AND (
              EXISTS (
                SELECT 1
                FROM unnest(tm.app_scope) AS scope_value(value)
                WHERE lower(scope_value.value) IN (
                  lower(m.id::text),
                  lower(coalesce(m.app_id, '')),
                  lower(coalesce(m.apple_app_id, '')),
                  lower(m.app_name),
                  lower(m.bundle_id)
                )
              )
              OR EXISTS (
                SELECT 1
                FROM unnest(tm.store_scope) AS scope_value(value)
                WHERE lower(scope_value.value) IN (
                  lower(m.store_profile_id::text),
                  lower(m.store_account_name)
                )
              )
            )
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_listen_iap_detail_topic(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_listen_iap_detail_topic(uuid, text) TO authenticated;

DO $$
BEGIN
  IF to_regclass('realtime.messages') IS NOT NULL THEN
    ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'realtime'
        AND tablename = 'messages'
        AND policyname = 'authenticated can receive iap detail broadcasts'
    ) THEN
      CREATE POLICY "authenticated can receive iap detail broadcasts"
      ON realtime.messages
      FOR SELECT
      TO authenticated
      USING (
        realtime.messages.extension = 'broadcast'
        AND public.can_listen_iap_detail_topic(
          (SELECT auth.uid()),
          (SELECT realtime.topic())
        )
      );
    END IF;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.broadcast_iap_detail_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, realtime
AS $$
DECLARE
  app_platform text;
  app_identifier text;
  changed_id text;
  store_profile_id text;
BEGIN
  IF TG_TABLE_NAME = 'iap_android' THEN
    app_platform := 'android';

    IF TG_OP = 'DELETE' THEN
      app_identifier := OLD.package_name;
      changed_id := OLD.id::text;
      store_profile_id := OLD.store_profile_id::text;
    ELSE
      app_identifier := NEW.package_name;
      changed_id := NEW.id::text;
      store_profile_id := NEW.store_profile_id::text;
    END IF;
  ELSIF TG_TABLE_NAME = 'ios_iap_transactions' THEN
    app_platform := 'ios';

    IF TG_OP = 'DELETE' THEN
      app_identifier := OLD.bundle_id;
      changed_id := OLD.id::text;
      store_profile_id := OLD.store_profile_id::text;
    ELSE
      app_identifier := NEW.bundle_id;
      changed_id := NEW.id::text;
      store_profile_id := NEW.store_profile_id::text;
    END IF;
  ELSIF TG_TABLE_NAME = 'ios_iap_notification_events' THEN
    app_platform := 'ios';

    IF TG_OP = 'DELETE' THEN
      app_identifier := OLD.bundle_id;
      changed_id := OLD.id::text;
      store_profile_id := OLD.store_profile_id::text;
    ELSE
      app_identifier := NEW.bundle_id;
      changed_id := NEW.id::text;
      store_profile_id := NEW.store_profile_id::text;
    END IF;
  END IF;

  IF app_platform IS NULL OR nullif(btrim(app_identifier), '') IS NULL THEN
    RETURN NULL;
  END IF;

  IF to_regprocedure('realtime.send(jsonb,text,text,boolean)') IS NULL THEN
    RETURN NULL;
  END IF;

  PERFORM realtime.send(
    jsonb_build_object(
      'id', changed_id,
      'identifier', app_identifier,
      'operation', TG_OP,
      'platform', app_platform,
      'storeProfileId', store_profile_id,
      'table', TG_TABLE_NAME,
      'updatedAt', clock_timestamp()
    ),
    'changed',
    'iap-detail:' || app_platform || ':' || app_identifier,
    true
  );

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.broadcast_iap_detail_change() FROM PUBLIC;

DROP TRIGGER IF EXISTS iap_android_detail_realtime ON public.iap_android;
CREATE TRIGGER iap_android_detail_realtime
AFTER INSERT OR UPDATE OR DELETE ON public.iap_android
FOR EACH ROW
EXECUTE FUNCTION public.broadcast_iap_detail_change();

DROP TRIGGER IF EXISTS ios_iap_transactions_detail_realtime ON public.ios_iap_transactions;
CREATE TRIGGER ios_iap_transactions_detail_realtime
AFTER INSERT OR UPDATE OR DELETE ON public.ios_iap_transactions
FOR EACH ROW
EXECUTE FUNCTION public.broadcast_iap_detail_change();

DROP TRIGGER IF EXISTS ios_iap_notification_events_detail_realtime ON public.ios_iap_notification_events;
CREATE TRIGGER ios_iap_notification_events_detail_realtime
AFTER INSERT OR UPDATE OR DELETE ON public.ios_iap_notification_events
FOR EACH ROW
EXECUTE FUNCTION public.broadcast_iap_detail_change();

CREATE INDEX IF NOT EXISTS ios_iap_notification_events_bundle_profile_received_idx
ON public.ios_iap_notification_events (bundle_id, store_profile_id, received_at DESC);
