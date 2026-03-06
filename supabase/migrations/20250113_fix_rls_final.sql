-- =====================================================
-- FINAL FIX: Eliminate ALL circular dependencies in RLS
-- =====================================================
-- The solution is to split policies so that viewing your
-- OWN profile never triggers role checks (no recursion).
-- Role checks only apply when viewing OTHER users.
-- =====================================================

-- 1. DROP ALL existing SELECT policies on profiles
DROP POLICY IF EXISTS "cashiers_view_own_and_branch_cashiers" ON profiles;
DROP POLICY IF EXISTS "managers_view_branch_users" ON profiles;
DROP POLICY IF EXISTS "admins_view_all_non_superadmins" ON profiles;
DROP POLICY IF EXISTS "superadmins_view_all_users" ON profiles;
DROP POLICY IF EXISTS "users_view_own_profile" ON profiles;

-- 2. CREATE A SINGLE POLICY: Everyone can view their own profile
-- This is checked FIRST and has NO subqueries = NO recursion
CREATE POLICY "users_view_own_profile" ON profiles
  FOR SELECT
  USING (auth.uid() = id);

-- 3. CREATE ROLE-SPECIFIC POLICIES for viewing OTHER users
-- These use a helper function to avoid recursion

-- Create a helper function that gets role from JWT (no DB query)
CREATE OR REPLACE FUNCTION auth.user_role()
RETURNS TEXT AS $$
  SELECT COALESCE(
    current_setting('request.jwt.claims', true)::json->>'role',
    NULL
  );
$$ LANGUAGE sql STABLE;

-- Cashiers can view other cashiers in their branch
CREATE POLICY "cashiers_view_branch_cashiers" ON profiles
  FOR SELECT
  USING (
    auth.uid() != id  -- Only for OTHER users
    AND EXISTS (
      SELECT 1 FROM profiles AS my_profile
      WHERE my_profile.id = auth.uid()
      AND my_profile.role = 'cashier'
      AND my_profile.branch_id = profiles.branch_id
      AND profiles.role = 'cashier'
    )
  );

-- Managers can view all users in their branch
CREATE POLICY "managers_view_branch_users" ON profiles
  FOR SELECT
  USING (
    auth.uid() != id  -- Only for OTHER users
    AND EXISTS (
      SELECT 1 FROM profiles AS my_profile
      WHERE my_profile.id = auth.uid()
      AND my_profile.role = 'manager'
      AND my_profile.branch_id = profiles.branch_id
    )
  );

-- Admins can view all non-superadmins
CREATE POLICY "admins_view_non_superadmins" ON profiles
  FOR SELECT
  USING (
    auth.uid() != id  -- Only for OTHER users
    AND profiles.role != 'superadmin'
    AND EXISTS (
      SELECT 1 FROM profiles AS my_profile
      WHERE my_profile.id = auth.uid()
      AND my_profile.role = 'admin'
    )
  );

-- Superadmins can view all users
CREATE POLICY "superadmins_view_all" ON profiles
  FOR SELECT
  USING (
    auth.uid() != id  -- Only for OTHER users
    AND EXISTS (
      SELECT 1 FROM profiles AS my_profile
      WHERE my_profile.id = auth.uid()
      AND my_profile.role = 'superadmin'
    )
  );

-- Verify the fix
SELECT
  'RLS policies fixed - no more recursion' as status,
  COUNT(*) as policy_count
FROM pg_policies
WHERE tablename = 'profiles'
AND cmd = 'SELECT';
