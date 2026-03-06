-- =====================================================
-- CREATE EMPLOYEES TABLE (HR Master Records)
-- Stores all staff: POS (linked to profiles) and non-POS (chefs, cleaners, etc.)
-- =====================================================

CREATE TABLE employees (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name           TEXT NOT NULL,
  employee_id_number  TEXT,                          -- National ID Number
  kra_pin             TEXT,                          -- Kenya Revenue Authority PIN
  phone               TEXT,
  email               TEXT,
  job_title           TEXT NOT NULL DEFAULT 'Staff', -- e.g., Cashier, Manager, Chef, Cleaner
  date_of_reporting   DATE,                          -- Date joined / started work
  branch_id           UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  next_of_kin_name    TEXT,
  next_of_kin_phone   TEXT,
  has_pos_account     BOOLEAN NOT NULL DEFAULT false,
  pos_profile_id      UUID REFERENCES profiles(id) ON DELETE SET NULL,  -- links to auth profile if POS user
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_employees_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_employees_updated_at
  BEFORE UPDATE ON employees
  FOR EACH ROW
  EXECUTE FUNCTION update_employees_updated_at();

-- Indexes
CREATE INDEX idx_employees_branch_id      ON employees(branch_id);
CREATE INDEX idx_employees_pos_profile_id ON employees(pos_profile_id);
CREATE INDEX idx_employees_is_active      ON employees(is_active);
CREATE INDEX idx_employees_has_pos        ON employees(has_pos_account);

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE employees ENABLE ROW LEVEL SECURITY;

-- Admins and Superadmins: full access
CREATE POLICY "admins_full_access_employees" ON employees
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'superadmin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'superadmin')
    )
  );

GRANT ALL ON employees TO authenticated;
GRANT ALL ON employees TO service_role;
