-- =====================================================
-- FIX BRANCHES TABLE RLS CIRCULAR DEPENDENCY
-- =====================================================
-- The branches RLS policies query the profiles table,
-- creating a circular dependency during sign-in.
--
-- Solution: Use raw_user_meta_data from auth.users instead
-- of querying the profiles table.
-- =====================================================

-- Drop existing branch policies
DROP POLICY IF EXISTS "cashiers_managers_view_own_branch" ON branches;
DROP POLICY IF EXISTS "admins_view_all_branches" ON branches;
DROP POLICY IF EXISTS "superadmins_manage_branches" ON branches;

-- NEW: Cashiers and Managers can view their own branch
-- Uses auth.jwt() to get role without querying profiles
CREATE POLICY "cashiers_managers_view_own_branch" ON branches
  FOR SELECT
  USING (
    -- Get role and branch from JWT claims (no profiles query needed!)
    (auth.jwt()->>'role')::text IN ('cashier', 'manager')
    AND id = (auth.jwt()->>'branch_id')::uuid
  );

-- NEW: Admins and Superadmins can view all branches
CREATE POLICY "admins_view_all_branches" ON branches
  FOR SELECT
  USING (
    (auth.jwt()->>'role')::text IN ('admin', 'superadmin')
  );

-- NEW: Only Superadmins can modify branches
CREATE POLICY "superadmins_manage_branches" ON branches
  FOR ALL
  USING (
    (auth.jwt()->>'role')::text = 'superadmin'
  );

-- Verify
SELECT 'Branches policies fixed' as status;
