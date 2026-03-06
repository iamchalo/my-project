-- Allow cashiers and managers to view active employees at their own branch.
-- Required so cashiers can see available chefs when assigning shifts.

CREATE POLICY "branch_staff_view_own_branch_employees" ON employees
  FOR SELECT
  TO authenticated
  USING (
    branch_id IN (
      SELECT branch_id FROM profiles
      WHERE id = auth.uid()
        AND role IN ('cashier', 'manager')
    )
    AND is_active = true
  );
