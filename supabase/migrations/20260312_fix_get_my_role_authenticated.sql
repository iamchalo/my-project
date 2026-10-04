-- =====================================================
-- FIX: get_my_role() returns 'authenticated' from JWT
-- =====================================================
-- Root cause: Clerk JWT template sets "role": "authenticated"
-- (the Supabase DB role), NOT the app role (cashier/admin/etc).
-- The fast path in get_my_role() returned "authenticated"
-- immediately, short-circuiting the DB fallback, so every
-- RLS policy (get_my_role() = 'cashier', etc.) always failed.
--
-- Fix: ignore the JWT "role" claim if it is "authenticated"
-- and always fall through to the DB lookup via clerk_id.
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT AS $$
DECLARE
  jwt_role  TEXT;
  db_role   TEXT;
  clerk_sub TEXT;
BEGIN
  -- 1. Try a custom app-role JWT claim first (only if NOT the
  --    Supabase DB role 'authenticated' that Clerk always sets)
  BEGIN
    jwt_role := nullif(current_setting('request.jwt.claims', true), '')::json->>'role';
  EXCEPTION WHEN OTHERS THEN
    jwt_role := NULL;
  END;

  IF jwt_role IS NOT NULL AND jwt_role != 'authenticated' THEN
    RETURN jwt_role;
  END IF;

  -- 2. DB fallback using raw JWT sub (Clerk user ID)
  BEGIN
    clerk_sub := nullif(current_setting('request.jwt.claims', true), '')::json->>'sub';
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;

  IF clerk_sub IS NULL THEN RETURN NULL; END IF;

  SELECT role INTO db_role FROM public.profiles WHERE clerk_id = clerk_sub;
  RETURN db_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;
