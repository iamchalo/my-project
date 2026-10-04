-- =====================================================
-- FIX: Replace auth.uid()::text with direct JWT sub extraction
-- =====================================================
-- Problem: auth.uid() in Supabase casts JWT 'sub' to UUID internally.
-- Clerk user IDs (e.g. "user_3AfUS05TdTQbJzW4kqdPzEber17") are NOT
-- valid UUIDs, so auth.uid() returns NULL, and auth.uid()::text is
-- also NULL. This breaks all DB fallback lookups in helper functions,
-- causing get_my_role() / get_my_branch() / get_my_profile_id() to
-- return NULL for every Clerk user → all RLS policies fail → 0s everywhere.
--
-- Fix: Use (current_setting('request.jwt.claims', true)::json->>'sub')
-- to extract the raw JWT sub as text, bypassing auth.uid() entirely.
-- =====================================================

-- ── Helper: get raw Clerk user ID from JWT sub ────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_clerk_id()
RETURNS TEXT AS $$
  SELECT nullif(current_setting('request.jwt.claims', true), '')::json->>'sub';
$$ LANGUAGE sql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION public.get_clerk_id() TO authenticated;

-- ── Fix: get_my_profile_id() ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_profile_id()
RETURNS UUID AS $$
  SELECT id FROM public.profiles
  WHERE clerk_id = (nullif(current_setting('request.jwt.claims', true), '')::json->>'sub')
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION public.get_my_profile_id() TO authenticated;

-- ── Fix: get_my_role() ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT AS $$
DECLARE
  jwt_role  TEXT;
  db_role   TEXT;
  clerk_sub TEXT;
BEGIN
  -- 1. Try JWT claims first (fast path — works if Clerk template includes 'role')
  BEGIN
    jwt_role := nullif(current_setting('request.jwt.claims', true), '')::json->>'role';
  EXCEPTION WHEN OTHERS THEN
    jwt_role := NULL;
  END;

  IF jwt_role IS NOT NULL THEN RETURN jwt_role; END IF;

  -- 2. DB fallback: use raw JWT sub (NOT auth.uid() which fails for Clerk)
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

-- ── Fix: get_my_branch() ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_branch()
RETURNS UUID AS $$
DECLARE
  jwt_branch UUID;
  db_branch  UUID;
  clerk_sub  TEXT;
BEGIN
  -- 1. Try JWT claims first
  BEGIN
    jwt_branch := (nullif(current_setting('request.jwt.claims', true), '')::json->>'branch_id')::uuid;
  EXCEPTION WHEN OTHERS THEN
    jwt_branch := NULL;
  END;

  IF jwt_branch IS NOT NULL THEN RETURN jwt_branch; END IF;

  -- 2. DB fallback: use raw JWT sub (NOT auth.uid() which fails for Clerk)
  BEGIN
    clerk_sub := nullif(current_setting('request.jwt.claims', true), '')::json->>'sub';
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;

  IF clerk_sub IS NULL THEN RETURN NULL; END IF;

  SELECT branch_id INTO db_branch FROM public.profiles WHERE clerk_id = clerk_sub;
  RETURN db_branch;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION public.get_my_branch() TO authenticated;

-- ── Fix: profiles RLS — users_view_own_profile ───────────────────────────────
-- Also uses auth.uid()::text which has the same NULL problem.
DROP POLICY IF EXISTS "users_view_own_profile" ON public.profiles;

CREATE POLICY "users_view_own_profile" ON public.profiles
  FOR SELECT
  USING (
    clerk_id = (nullif(current_setting('request.jwt.claims', true), '')::json->>'sub')
  );

-- ── Fix: profiles RLS — users_update_own_profile ────────────────────────────
DROP POLICY IF EXISTS "users_update_own_profile" ON public.profiles;

CREATE POLICY "users_update_own_profile" ON public.profiles
  FOR UPDATE
  USING (
    clerk_id = (nullif(current_setting('request.jwt.claims', true), '')::json->>'sub')
  )
  WITH CHECK (
    clerk_id = (nullif(current_setting('request.jwt.claims', true), '')::json->>'sub')
  );
