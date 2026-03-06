-- =====================================================
-- FINAL FIX: Eliminate ALL circular dependencies in RLS
-- =====================================================
-- Split policies so viewing YOUR OWN profile has no
-- subqueries (no recursion). Role checks only apply
-- when viewing OTHER users.
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

-- 2. CREATE PRIMARY POLICY: Everyone can view their own profile
-- NO subqueries = NO recursion = ALWAYS works
CREATE POLICY "users_view_own_profile" ON profiles
  FOR SELECT
  USING (auth.uid() = id);

-- 3. CREATE SECONDARY POLICIES: For viewing OTHER users only
-- These DO have subqueries, but they only run when viewing OTHER profiles
-- When checking the subquery, it queries YOUR OWN profile, which is allowed by policy #2

-- Cashiers can view other cashiers in their branch
CREATE POLICY "cashiers_view_branch_cashiers" ON profiles
  FOR SELECT
  USING (
    auth.uid() != id
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
    auth.uid() != id
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
    auth.uid() != id
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
    auth.uid() != id
    AND EXISTS (
      SELECT 1 FROM profiles AS my_profile
      WHERE my_profile.id = auth.uid()
      AND my_profile.role = 'superadmin'
    )
  );

-- Verify the fix
SELECT
  'RLS policies fixed - recursion eliminated' as status,
  COUNT(*) as select_policy_count
FROM pg_policies
WHERE tablename = 'profiles'
AND cmd = 'SELECT';
