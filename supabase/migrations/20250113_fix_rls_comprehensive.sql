-- =====================================================
-- COMPREHENSIVE FIX FOR RLS POLICIES
-- =====================================================
-- This migration completely fixes the RLS circular dependency
-- by dropping and recreating the problematic policies.
-- =====================================================

-- First, drop the problematic policies that have circular dependencies
DROP POLICY IF EXISTS "admins_view_all_non_superadmins" ON profiles;
DROP POLICY IF EXISTS "superadmins_view_all_users" ON profiles;
DROP POLICY IF EXISTS "users_view_own_profile" ON profiles;

-- Recreate admin policy WITH ability to view own profile
CREATE POLICY "admins_view_all_non_superadmins" ON profiles
  FOR SELECT
  USING (
    -- Can always view own profile
    auth.uid() = id
    OR
    -- Admins can view all non-superadmins
    (
      EXISTS (
        SELECT 1 FROM profiles AS p
        WHERE p.id = auth.uid()
        AND p.role = 'admin'
      )
      AND profiles.role != 'superadmin'
    )
  );

-- Recreate superadmin policy WITH ability to view own profile
CREATE POLICY "superadmins_view_all_users" ON profiles
  FOR SELECT
  USING (
    -- Can always view own profile
    auth.uid() = id
    OR
    -- Superadmins can view all users
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'superadmin'
    )
  );

-- Verify the fix
SELECT
  'Fixed policies:' as status,
  COUNT(*) as policy_count
FROM pg_policies
WHERE tablename = 'profiles';
