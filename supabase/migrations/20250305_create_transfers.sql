-- =====================================================
-- CREATE STOCK TRANSFERS TABLE
-- =====================================================

CREATE TABLE transfers (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transfer_id   TEXT UNIQUE NOT NULL,          -- human-readable ID e.g. TRF-00000001
  item          TEXT NOT NULL,
  price         DECIMAL(10, 2) NOT NULL CHECK (price >= 0),
  quantity      INTEGER NOT NULL CHECK (quantity > 0),
  from_branch   UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  to_branch     UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  transfer_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'in_transit', 'approved')),
  created_by    UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT different_branches CHECK (from_branch <> to_branch)
);

-- Sequence for human-readable transfer IDs
CREATE SEQUENCE transfer_number_seq START 1;

-- Function to generate transfer ID
CREATE OR REPLACE FUNCTION generate_transfer_id()
RETURNS TEXT AS $$
BEGIN
  RETURN 'TRF-' || LPAD(nextval('transfer_number_seq')::TEXT, 8, '0');
END;
$$ LANGUAGE plpgsql;

-- Auto-set transfer_id on insert
CREATE OR REPLACE FUNCTION set_transfer_id()
RETURNS TRIGGER AS $$
BEGIN
  NEW.transfer_id := generate_transfer_id();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_set_transfer_id
  BEFORE INSERT ON transfers
  FOR EACH ROW
  EXECUTE FUNCTION set_transfer_id();

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_transfers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_transfers_updated_at
  BEFORE UPDATE ON transfers
  FOR EACH ROW
  EXECUTE FUNCTION update_transfers_updated_at();

-- Indexes
CREATE INDEX idx_transfers_from_branch  ON transfers(from_branch);
CREATE INDEX idx_transfers_to_branch    ON transfers(to_branch);
CREATE INDEX idx_transfers_status       ON transfers(status);
CREATE INDEX idx_transfers_date         ON transfers(transfer_date DESC);
CREATE INDEX idx_transfers_created_by   ON transfers(created_by);

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE transfers ENABLE ROW LEVEL SECURITY;

-- Managers: can view transfers where their branch is sender OR receiver
CREATE POLICY "managers_view_own_branch_transfers" ON transfers
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'manager'
        AND (profiles.branch_id = transfers.from_branch
          OR profiles.branch_id = transfers.to_branch)
    )
  );

-- Managers: can create transfers FROM their own branch
CREATE POLICY "managers_create_transfers" ON transfers
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'manager'
        AND profiles.branch_id = from_branch
    )
    AND created_by = auth.uid()
  );

-- Managers: receiving branch can update status only (not other fields)
-- Enforced in application logic; RLS allows UPDATE for receiving branch managers
CREATE POLICY "managers_update_received_transfers" ON transfers
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'manager'
        AND profiles.branch_id = transfers.to_branch
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'manager'
        AND profiles.branch_id = transfers.to_branch
    )
  );

-- Admins and Superadmins: full access
CREATE POLICY "admins_full_access_transfers" ON transfers
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'superadmin')
    )
  );

-- Grants
GRANT ALL ON transfers TO authenticated;
GRANT ALL ON transfers TO service_role;
GRANT USAGE, SELECT ON SEQUENCE transfer_number_seq TO authenticated;
GRANT EXECUTE ON FUNCTION generate_transfer_id() TO authenticated;
