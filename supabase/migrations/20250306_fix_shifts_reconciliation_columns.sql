-- =====================================================
-- FIX SHIFTS TABLE: Add reconciliation columns
-- The active-shift system (20250118_create_shifts.sql) is the base.
-- This adds the end-of-shift reconciliation columns that the
-- Sales & Stock page writes to.
-- =====================================================

-- Sequence for human-readable shift numbers
CREATE SEQUENCE IF NOT EXISTS shift_number_seq START 1;

-- Generate a unique sequential shift number
CREATE OR REPLACE FUNCTION generate_shift_number()
RETURNS BIGINT AS $$
BEGIN
  RETURN nextval('shift_number_seq');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION generate_shift_number() TO authenticated;

-- Add reconciliation columns to shifts (safe to run even if some already exist)
ALTER TABLE shifts
  ADD COLUMN IF NOT EXISTS shift_number         BIGINT UNIQUE,
  ADD COLUMN IF NOT EXISTS balance_brought_down DECIMAL(10, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mpesa_amount         DECIMAL(10, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paybill_amount       DECIMAL(10, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS expense_total        DECIMAL(10, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cash_in_hand         DECIMAL(10, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS grand_total          DECIMAL(10, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS denom_1000_qty       INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS denom_1000_total     DECIMAL(10, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS denom_500_qty        INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS denom_500_total      DECIMAL(10, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS denom_200_qty        INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS denom_200_total      DECIMAL(10, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS denom_100_qty        INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS denom_100_total      DECIMAL(10, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS denom_50_qty         INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS denom_50_total       DECIMAL(10, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS coins_amount         DECIMAL(10, 2) DEFAULT 0;

-- =====================================================
-- STOCK COUNTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS stock_counts (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shift_id      UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  product_id    UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  opening_stock INTEGER NOT NULL DEFAULT 0 CHECK (opening_stock >= 0),
  additions     INTEGER NOT NULL DEFAULT 0 CHECK (additions >= 0),
  spoilt        INTEGER NOT NULL DEFAULT 0 CHECK (spoilt >= 0),
  closing_stock INTEGER NOT NULL DEFAULT 0 CHECK (closing_stock >= 0),
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(shift_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_stock_counts_shift   ON stock_counts(shift_id);
CREATE INDEX IF NOT EXISTS idx_stock_counts_product ON stock_counts(product_id);

ALTER TABLE stock_counts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- stock_counts: cashiers/managers can view their branch's counts
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'stock_counts' AND policyname = 'cashiers_view_stock_counts') THEN
    CREATE POLICY "cashiers_view_stock_counts" ON stock_counts
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM shifts s
          JOIN profiles p ON p.id = auth.uid()
          WHERE s.id = stock_counts.shift_id
            AND s.branch_id = p.branch_id
            AND p.role IN ('cashier', 'manager')
        )
      );
  END IF;

  -- stock_counts: cashiers can insert for their own shifts
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'stock_counts' AND policyname = 'cashiers_insert_stock_counts') THEN
    CREATE POLICY "cashiers_insert_stock_counts" ON stock_counts
      FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM shifts s
          WHERE s.id = stock_counts.shift_id
            AND s.cashier_id = auth.uid()
        )
      );
  END IF;

  -- stock_counts: admins full access
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'stock_counts' AND policyname = 'admins_full_access_stock_counts') THEN
    CREATE POLICY "admins_full_access_stock_counts" ON stock_counts
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'superadmin')
        )
      );
  END IF;

  -- shifts: allow cashiers to insert reconciliation rows (is_active = false)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'shifts' AND policyname = 'cashiers_insert_reconciliation') THEN
    CREATE POLICY "cashiers_insert_reconciliation" ON shifts
      FOR INSERT
      TO authenticated
      WITH CHECK (
        cashier_id = auth.uid()
        AND is_active = false
        AND EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
            AND profiles.branch_id = shifts.branch_id
        )
      );
  END IF;
END;
$$;

GRANT ALL ON stock_counts TO authenticated;
GRANT ALL ON stock_counts TO service_role;
