-- =====================================================
-- SHIFT CHEF ASSIGNMENTS
-- Tracks which chefs are on duty for each shift/branch.
-- Cashiers assign chefs when starting a shift.
-- =====================================================

CREATE TABLE shift_chef_assignments (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shift_id    UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  branch_id   UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  assigned_by UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_chef_per_shift UNIQUE (shift_id, employee_id)
);

-- Prevent assigning a chef who is already on an active shift at another branch
CREATE OR REPLACE FUNCTION check_chef_not_on_active_shift()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM shift_chef_assignments sca
    JOIN shifts s ON sca.shift_id = s.id
    WHERE sca.employee_id = NEW.employee_id
      AND s.is_active = true
      AND sca.shift_id <> NEW.shift_id
      AND sca.branch_id <> NEW.branch_id
  ) THEN
    RAISE EXCEPTION 'Chef is already assigned to an active shift at another branch';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_chef_shift
  BEFORE INSERT ON shift_chef_assignments
  FOR EACH ROW
  EXECUTE FUNCTION check_chef_not_on_active_shift();

-- Indexes
CREATE INDEX idx_sca_shift_id    ON shift_chef_assignments(shift_id);
CREATE INDEX idx_sca_employee_id ON shift_chef_assignments(employee_id);
CREATE INDEX idx_sca_branch_id   ON shift_chef_assignments(branch_id);

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE shift_chef_assignments ENABLE ROW LEVEL SECURITY;

-- Cashiers / Managers: view assignments for their branch
CREATE POLICY "branch_staff_view_assignments" ON shift_chef_assignments
  FOR SELECT
  TO authenticated
  USING (
    branch_id IN (
      SELECT branch_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Cashiers: insert assignments for their own branch's active shift
CREATE POLICY "cashiers_insert_assignments" ON shift_chef_assignments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    assigned_by = auth.uid()
    AND branch_id IN (
      SELECT branch_id FROM profiles WHERE id = auth.uid() AND role IN ('cashier', 'manager')
    )
    AND EXISTS (
      SELECT 1 FROM shifts
      WHERE id = shift_id AND is_active = true
        AND branch_id IN (SELECT branch_id FROM profiles WHERE id = auth.uid())
    )
  );

-- Cashiers: delete (unassign) chefs from active shifts they manage
CREATE POLICY "cashiers_delete_assignments" ON shift_chef_assignments
  FOR DELETE
  TO authenticated
  USING (
    assigned_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM shifts WHERE id = shift_id AND is_active = true
    )
  );

-- Admins and Superadmins: full access
CREATE POLICY "admins_full_access_assignments" ON shift_chef_assignments
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'superadmin')
    )
  );

GRANT ALL ON shift_chef_assignments TO authenticated;
GRANT ALL ON shift_chef_assignments TO service_role;
