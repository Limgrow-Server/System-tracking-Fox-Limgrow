-- Supabase previously enabled RLS on these tables without installing policies.
-- The self-hosted deployment authenticates requests in the application and uses
-- private-network PostgreSQL service roles with explicit table grants. With RLS
-- enabled and no policy, valid Prisma reads/writes fail with PostgreSQL 42501.
DO $$
BEGIN
  IF to_regclass('public.credential_secret_otps') IS NOT NULL THEN
    ALTER TABLE public.credential_secret_otps DISABLE ROW LEVEL SECURITY;
  END IF;

  IF to_regclass('public.credential_secret_unlocks') IS NOT NULL THEN
    ALTER TABLE public.credential_secret_unlocks DISABLE ROW LEVEL SECURITY;
  END IF;
END
$$;
