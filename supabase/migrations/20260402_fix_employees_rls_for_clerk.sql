-- =====================================================
-- FIX: employees RLS policies for Clerk auth
-- =====================================================
-- The employees table was never updated during the Clerk
-- auth migration. Both policies use profiles.id = auth.uid()
-- which returns NULL for Clerk users → admins/superadmins
-- get "Failed to load staff records" error.
--
-- Fix: Use get_my_role() / get_my_branch() (Clerk-safe helpers)
-- instead of auth.uid() pattern.
-- =====================================================

DROP POLICY IF EXISTS "admins_full_access_employees"           ON public.employees;
DROP POLICY IF EXISTS "branch_staff_view_own_branch_employees" ON public.employees;

-- Admins & Superadmins: full access to all employee records
CREATE POLICY "admins_full_access_employees" ON public.employees
  FOR ALL
  TO authenticated
  USING (public.get_my_role() IN ('admin', 'superadmin'))
  WITH CHECK (public.get_my_role() IN ('admin', 'superadmin'));

-- Cashiers & Managers: view active employees at their own branch
CREATE POLICY "branch_staff_view_own_branch_employees" ON public.employees
  FOR SELECT
  TO authenticated
  USING (
    branch_id = public.get_my_branch()
    AND public.get_my_role() IN ('cashier', 'manager')
    AND is_active = true
  );
