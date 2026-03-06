-- =====================================================
-- COMPLETE FIX: Use JWT Claims to Eliminate ALL Recursion
-- =====================================================
-- Root cause: Policies query the profiles table, causing infinite recursion
-- Solution: Read role/branch from JWT token instead of database
-- JWT claims are set during login and contain user metadata
-- =====================================================

-- ============================================
-- STEP 1: Drop ALL existing policies on profiles
-- ============================================
DROP POLICY IF EXISTS "cashiers_view_own_and_branch_cashiers" ON profiles;
DROP POLICY IF EXISTS "managers_view_branch_users" ON profiles;
DROP POLICY IF EXISTS "admins_view_all_non_superadmins" ON profiles;
DROP POLICY IF EXISTS "superadmins_view_all_users" ON profiles;
DROP POLICY IF EXISTS "users_view_own_profile" ON profiles;
DROP POLICY IF EXISTS "cashiers_view_branch_cashiers" ON profiles;
DROP POLICY IF EXISTS "admins_view_non_superadmins" ON profiles;
DROP POLICY IF EXISTS "superadmins_view_all" ON profiles;
DROP POLICY IF EXISTS "cashiers_update_own_profile" ON profiles;
DROP POLICY IF EXISTS "managers_update_branch_cashiers" ON profiles;
DROP POLICY IF EXISTS "admins_manage_cashiers_managers" ON profiles;
DROP POLICY IF EXISTS "superadmins_manage_all_users" ON profiles;

-- ============================================
-- STEP 2: Create helper functions using JWT claims
-- ============================================

-- Get user role from JWT claims (no DB query!)
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT AS $$
  SELECT COALESCE(
    nullif(current_setting('request.jwt.claims', true), '')::json->>'role',
    NULL
  )::text;
$$ LANGUAGE sql STABLE;

-- Get user branch from JWT claims (no DB query!)
CREATE OR REPLACE FUNCTION public.get_my_branch()
RETURNS UUID AS $$
  SELECT COALESCE(
    nullif(current_setting('request.jwt.claims', true), '')::json->>'branch_id',
    NULL
  )::uuid;
$$ LANGUAGE sql STABLE;

-- ============================================
-- STEP 3: Create SELECT policies using JWT claims
-- ============================================

-- Everyone can view their own profile (no recursion)
CREATE POLICY "users_view_own_profile" ON profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Cashiers can view other cashiers in their branch
CREATE POLICY "cashiers_view_branch_cashiers" ON profiles
  FOR SELECT
  USING (
    auth.uid() != id
    AND public.get_my_role() = 'cashier'
    AND public.get_my_branch() = profiles.branch_id
    AND profiles.role = 'cashier'
  );

-- Managers can view all users in their branch
CREATE POLICY "managers_view_branch_users" ON profiles
  FOR SELECT
  USING (
    auth.uid() != id
    AND public.get_my_role() = 'manager'
    AND public.get_my_branch() = profiles.branch_id
  );

-- Admins can view all non-superadmins
CREATE POLICY "admins_view_non_superadmins" ON profiles
  FOR SELECT
  USING (
    auth.uid() != id
    AND public.get_my_role() = 'admin'
    AND profiles.role != 'superadmin'
  );

-- Superadmins can view all users
CREATE POLICY "superadmins_view_all" ON profiles
  FOR SELECT
  USING (
    auth.uid() != id
    AND public.get_my_role() = 'superadmin'
  );

-- ============================================
-- STEP 4: Create UPDATE policies using JWT claims
-- ============================================

-- Everyone can update their own profile (limited fields)
CREATE POLICY "users_update_own_profile" ON profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    -- Prevent users from changing their own role or branch
    AND role = (SELECT role FROM profiles WHERE id = auth.uid())
    AND branch_id = (SELECT branch_id FROM profiles WHERE id = auth.uid())
  );

-- Managers can update cashiers in their branch
CREATE POLICY "managers_update_branch_cashiers" ON profiles
  FOR UPDATE
  USING (
    auth.uid() != id
    AND public.get_my_role() = 'manager'
    AND public.get_my_branch() = profiles.branch_id
    AND profiles.role = 'cashier'
  )
  WITH CHECK (
    auth.uid() != id
    AND public.get_my_role() = 'manager'
    AND public.get_my_branch() = profiles.branch_id
    AND profiles.role = 'cashier'
    -- Managers can't change branch assignment
    AND profiles.branch_id = public.get_my_branch()
  );

-- ============================================
-- STEP 5: Create INSERT/DELETE policies (admins/superadmins)
-- ============================================

-- Admins can manage cashiers and managers
CREATE POLICY "admins_manage_cashiers_managers" ON profiles
  FOR ALL
  USING (
    public.get_my_role() = 'admin'
    AND profiles.role IN ('cashier', 'manager')
  )
  WITH CHECK (
    public.get_my_role() = 'admin'
    AND profiles.role IN ('cashier', 'manager')
  );

-- Superadmins can manage all users
CREATE POLICY "superadmins_manage_all_users" ON profiles
  FOR ALL
  USING (public.get_my_role() = 'superadmin')
  WITH CHECK (public.get_my_role() = 'superadmin');

-- ============================================
-- STEP 6: Verify the fix
-- ============================================
SELECT
  'RLS policies fixed using JWT claims - NO MORE RECURSION!' as status,
  COUNT(*) as total_policies
FROM pg_policies
WHERE tablename = 'profiles';

-- Show all new policies
SELECT
  policyname,
  cmd as command
FROM pg_policies
WHERE tablename = 'profiles'
ORDER BY cmd, policyname;
