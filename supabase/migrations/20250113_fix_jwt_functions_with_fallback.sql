-- =====================================================
-- FIX JWT HELPER FUNCTIONS - Add Database Fallback
-- =====================================================
-- Issue: JWT claims don't contain role/branch_id by default
-- Solution: Try JWT first, fall back to database query (with SECURITY DEFINER)
-- SECURITY DEFINER bypasses RLS, preventing infinite recursion
-- =====================================================

-- Update get_my_role() to fall back to database
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT AS $$
DECLARE
  jwt_role TEXT;
  db_role TEXT;
BEGIN
  -- First, try to get role from JWT claims
  BEGIN
    jwt_role := COALESCE(
      nullif(current_setting('request.jwt.claims', true), '')::json->>'role',
      NULL
    )::text;
  EXCEPTION WHEN OTHERS THEN
    jwt_role := NULL;
  END;

  -- If JWT has role, return it
  IF jwt_role IS NOT NULL THEN
    RETURN jwt_role;
  END IF;

  -- Otherwise, query database (SECURITY DEFINER bypasses RLS)
  SELECT role INTO db_role
  FROM profiles
  WHERE id = auth.uid();

  RETURN db_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Update get_my_branch() to fall back to database
CREATE OR REPLACE FUNCTION public.get_my_branch()
RETURNS UUID AS $$
DECLARE
  jwt_branch UUID;
  db_branch UUID;
BEGIN
  -- First, try to get branch from JWT claims
  BEGIN
    jwt_branch := COALESCE(
      nullif(current_setting('request.jwt.claims', true), '')::json->>'branch_id',
      NULL
    )::uuid;
  EXCEPTION WHEN OTHERS THEN
    jwt_branch := NULL;
  END;

  -- If JWT has branch, return it
  IF jwt_branch IS NOT NULL THEN
    RETURN jwt_branch;
  END IF;

  -- Otherwise, query database (SECURITY DEFINER bypasses RLS)
  SELECT branch_id INTO db_branch
  FROM profiles
  WHERE id = auth.uid();

  RETURN db_branch;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Verify the fix
SELECT
  'JWT helper functions updated with database fallback' as status,
  public.get_my_role() as current_role,
  public.get_my_branch() as current_branch;
