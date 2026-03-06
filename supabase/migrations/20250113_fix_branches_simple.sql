-- =====================================================
-- SIMPLE FIX: Allow authenticated users to view branches
-- =====================================================
-- The complex RLS policies on branches create circular
-- dependencies. Since branches are relatively static
-- reference data, we'll allow all authenticated users
-- to VIEW branches. Only superadmins can modify them.
-- =====================================================

-- Drop existing problematic policies
DROP POLICY IF EXISTS "cashiers_managers_view_own_branch" ON branches;
DROP POLICY IF EXISTS "admins_view_all_branches" ON branches;
DROP POLICY IF EXISTS "superadmins_manage_branches" ON branches;

-- Allow all authenticated users to view branches
CREATE POLICY "authenticated_users_view_branches" ON branches
  FOR SELECT
  TO authenticated
  USING (true);

-- Only allow inserts/updates/deletes for users with superadmin role in profiles
-- We check the profiles table here, but only for modifications (not reads)
CREATE POLICY "superadmins_manage_branches" ON branches
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'superadmin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'superadmin'
    )
  );

SELECT 'Branches RLS simplified - all authenticated users can view' as status;
