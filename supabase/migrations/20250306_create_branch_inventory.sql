-- =====================================================
-- BRANCH INVENTORY TABLE
-- Tracks physical inventory per branch.
-- Two types: 'countable' (count only) and 'stocked' (qty + price).
-- =====================================================

CREATE TABLE branch_inventory (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id   UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  item_name   TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT 'General',   -- e.g. Equipment, Consumables, Furniture
  item_type   TEXT NOT NULL DEFAULT 'stocked'
                CHECK (item_type IN ('countable', 'stocked')),
  count       INTEGER,                            -- used when item_type = 'countable'
  quantity    DECIMAL(10, 2),                     -- used when item_type = 'stocked'
  price       DECIMAL(10, 2),                     -- unit price, used when item_type = 'stocked'
  notes       TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_branch_inventory_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_branch_inventory_updated_at
  BEFORE UPDATE ON branch_inventory
  FOR EACH ROW
  EXECUTE FUNCTION update_branch_inventory_updated_at();

-- Indexes
CREATE INDEX idx_branch_inventory_branch_id  ON branch_inventory(branch_id);
CREATE INDEX idx_branch_inventory_item_type  ON branch_inventory(item_type);
CREATE INDEX idx_branch_inventory_category   ON branch_inventory(category);
CREATE INDEX idx_branch_inventory_is_active  ON branch_inventory(is_active);

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE branch_inventory ENABLE ROW LEVEL SECURITY;

-- Admins and Superadmins: full access
CREATE POLICY "admins_full_access_inventory" ON branch_inventory
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

GRANT ALL ON branch_inventory TO authenticated;
GRANT ALL ON branch_inventory TO service_role;
