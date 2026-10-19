CREATE OR REPLACE FUNCTION public.system_tracking_get_vault_secret(secret_id uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = vault, public
AS $$
  SELECT decrypted_secret::text
  FROM vault.decrypted_secrets
  WHERE id = secret_id
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.system_tracking_get_vault_secret(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.system_tracking_get_vault_secret(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.system_tracking_get_vault_secret(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.system_tracking_get_vault_secret(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
