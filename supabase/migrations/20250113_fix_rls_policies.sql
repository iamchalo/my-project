-- =====================================================
-- FIX RLS CIRCULAR DEPENDENCY
-- =====================================================
-- This migration fixes the circular dependency issue in RLS policies
-- that prevents admins and superadmins from viewing their own profiles.
--
-- Problem: The existing policies for admins/superadmins check the user's
-- role from the profiles table, which creates a circular dependency.
--
-- Solution: Add a catch-all policy that allows users to always view
-- their own profile, regardless of role.
-- =====================================================

-- Add a simple policy that allows everyone to view their own profile
-- This must be checked FIRST before role-specific policies
CREATE POLICY "users_view_own_profile" ON profiles
  FOR SELECT
  USING (auth.uid() = id);

-- This policy is checked first and short-circuits the evaluation,
-- preventing the circular dependency in admin/superadmin policies.

-- Note: The existing role-specific policies still work for viewing OTHER users' profiles.
-- This new policy only affects viewing your OWN profile.
