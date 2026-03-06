-- =====================================================
-- ULTIMATE FIX: Use SECURITY DEFINER to bypass RLS
-- =====================================================
-- The issue: RLS policies that query profiles create recursion
-- The solution: SECURITY DEFINER functions bypass RLS completely
-- =====================================================

-- 1. DROP ALL existing SELECT policies on profiles
DROP POLICY IF EXISTS "cashiers_view_own_and_branch_cashiers" ON profiles;
DROP POLICY IF EXISTS "managers_view_branch_users" ON profiles;
DROP POLICY IF EXISTS "admins_view_all_non_superadmins" ON profiles;
DROP POLICY IF EXISTS "superadmins_view_all_users" ON profiles;
DROP POLICY IF EXISTS "users_view_own_profile" ON profiles;
DROP POLICY IF EXISTS "cashiers_view_branch_cashiers" ON profiles;
DROP POLICY IF EXISTS "admins_view_non_superadmins" ON profiles;
DROP POLICY IF EXISTS "superadmins_view_all" ON profiles;

-- 2. Re-use existing helper functions (they already have SECURITY DEFINER)
-- get_user_role(user_id) - already exists from original migration
-- get_user_branch(user_id) - already exists from original migration

-- 3. CREATE NEW POLICIES using these helper functions (NO recursion!)

-- Everyone can view their own profile
CREATE POLICY "users_view_own_profile" ON profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Cashiers can view other cashiers in their branch
CREATE POLICY "cashiers_view_branch_cashiers" ON profiles
  FOR SELECT
  USING (
    auth.uid() != id
    AND get_user_role(auth.uid()) = 'cashier'
    AND get_user_branch(auth.uid()) = profiles.branch_id
    AND profiles.role = 'cashier'
  );

-- Managers can view all users in their branch
CREATE POLICY "managers_view_branch_users" ON profiles
  FOR SELECT
  USING (
    auth.uid() != id
    AND get_user_role(auth.uid()) = 'manager'
    AND get_user_branch(auth.uid()) = profiles.branch_id
  );

-- Admins can view all non-superadmins
CREATE POLICY "admins_view_non_superadmins" ON profiles
  FOR SELECT
  USING (
    auth.uid() != id
    AND get_user_role(auth.uid()) = 'admin'
    AND profiles.role != 'superadmin'
  );

-- Superadmins can view all users
CREATE POLICY "superadmins_view_all" ON profiles
  FOR SELECT
  USING (
    auth.uid() != id
    AND get_user_role(auth.uid()) = 'superadmin'
  );

-- Verify the fix
SELECT
  'RLS policies using SECURITY DEFINER functions - no recursion!' as status,
  COUNT(*) as select_policy_count
FROM pg_policies
WHERE tablename = 'profiles'
AND cmd = 'SELECT';
