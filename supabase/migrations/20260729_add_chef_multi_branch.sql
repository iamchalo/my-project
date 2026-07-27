-- =====================================================
-- MULTI-BRANCH CHEFS
-- =====================================================
-- Chefs (non-POS `employees` rows, job_title = 'Chef') keep one home
-- branch (employees.branch_id) but can now also be authorized for
-- additional branches via employee_branches. Chefs have no `profiles`
-- row, so this can't reuse cashier_branches (which is keyed on
-- profiles.id) — it needs its own junction table keyed on employees.id.
--
-- get_branch_chefs() is the single source of truth for "which chefs
-- can be picked at this branch" (home branch OR employee_branches),
-- replacing the direct .eq('branch_id', ...) queries in the chef
-- picker UIs.
--
-- Also re-fixes shift_chef_assignments RLS, which was reverted back
-- to the broken pre-Clerk "profiles.id = auth.uid()" pattern by
-- 20260312_restore_original_rls.sql and never fixed again (same bug
-- class as orders/expenses in 20260728_fix_orders_expenses_rls_clerk.sql).
-- This sits directly in the chef-assignment path, so it's fixed here.
-- =====================================================

-- =====================================================
-- 1. employee_branches — additional branches a chef is authorized for
-- =====================================================
CREATE TABLE IF NOT EXISTS employee_branches (
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  branch_id   UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (employee_id, branch_id)
);

CREATE INDEX IF NOT EXISTS idx_employee_branches_employee_id ON employee_branches(employee_id);

ALTER TABLE employee_branches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_full_access_employee_branches" ON employee_branches
  FOR ALL
  TO authenticated
  USING (get_my_role() IN ('admin', 'superadmin'))
  WITH CHECK (get_my_role() IN ('admin', 'superadmin'));

GRANT SELECT ON employee_branches TO authenticated;
GRANT ALL ON employee_branches TO service_role;

COMMENT ON TABLE employee_branches IS 'Additional branches (beyond the home branch) a chef/employee is authorized to work at';

-- =====================================================
-- 2. get_branch_chefs() — chefs available at a branch (home OR additional)
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_branch_chefs(target_branch_id UUID)
RETURNS TABLE (id UUID, full_name TEXT) AS $$
  SELECT e.id, e.full_name
  FROM public.employees e
  WHERE e.job_title = 'Chef'
    AND e.is_active = true
    AND (
      e.branch_id = target_branch_id
      OR EXISTS (
        SELECT 1 FROM public.employee_branches eb
        WHERE eb.employee_id = e.id AND eb.branch_id = target_branch_id
      )
    )
  ORDER BY e.full_name;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION public.get_branch_chefs(UUID) TO authenticated;

-- =====================================================
-- 3. Re-fix shift_chef_assignments RLS for Clerk
-- =====================================================
DROP POLICY IF EXISTS "branch_staff_view_assignments" ON public.shift_chef_assignments;
DROP POLICY IF EXISTS "cashiers_insert_assignments"   ON public.shift_chef_assignments;
DROP POLICY IF EXISTS "cashiers_delete_assignments"   ON public.shift_chef_assignments;
DROP POLICY IF EXISTS "admins_full_access_assignments" ON public.shift_chef_assignments;

CREATE POLICY "branch_staff_view_assignments" ON public.shift_chef_assignments
  FOR SELECT
  TO authenticated
  USING (
    branch_id = public.get_my_branch()
    AND public.get_my_role() IN ('cashier', 'manager')
  );

CREATE POLICY "cashiers_insert_assignments" ON public.shift_chef_assignments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.get_my_role() = 'cashier'
    AND branch_id = public.get_my_branch()
    AND assigned_by = public.get_my_profile_id()
    AND EXISTS (
      SELECT 1 FROM public.shifts
      WHERE id = shift_id AND is_active = true
        AND branch_id = public.get_my_branch()
    )
  );

CREATE POLICY "cashiers_delete_assignments" ON public.shift_chef_assignments
  FOR DELETE
  TO authenticated
  USING (
    public.get_my_role() = 'cashier'
    AND assigned_by = public.get_my_profile_id()
    AND EXISTS (
      SELECT 1 FROM public.shifts WHERE id = shift_id AND is_active = true
    )
  );

CREATE POLICY "admins_full_access_assignments" ON public.shift_chef_assignments
  FOR ALL
  TO authenticated
  USING (public.get_my_role() IN ('admin', 'superadmin'));
