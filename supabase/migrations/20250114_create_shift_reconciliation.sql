-- =====================================================
-- CREATE SHIFT RECONCILIATION SYSTEM
-- =====================================================
-- This handles end-of-shift stock counting and cash reconciliation
-- =====================================================

-- =====================================================
-- CREATE SHIFTS TABLE
-- =====================================================
CREATE TABLE shifts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shift_number BIGINT UNIQUE NOT NULL,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  cashier_id UUID NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  shift_date DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Cash Reconciliation
  balance_brought_down DECIMAL(10, 2) DEFAULT 0 CHECK (balance_brought_down >= 0),
  mpesa_amount DECIMAL(10, 2) DEFAULT 0 CHECK (mpesa_amount >= 0),
  paybill_amount DECIMAL(10, 2) DEFAULT 0 CHECK (paybill_amount >= 0),
  expense_total DECIMAL(10, 2) DEFAULT 0 CHECK (expense_total >= 0),
  cash_in_hand DECIMAL(10, 2) DEFAULT 0 CHECK (cash_in_hand >= 0),
  grand_total DECIMAL(10, 2) DEFAULT 0,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- CREATE STOCK COUNTS TABLE
-- =====================================================
CREATE TABLE stock_counts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shift_id UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  opening_stock INTEGER NOT NULL DEFAULT 0 CHECK (opening_stock >= 0),
  additions INTEGER NOT NULL DEFAULT 0 CHECK (additions >= 0),
  spoilt INTEGER NOT NULL DEFAULT 0 CHECK (spoilt >= 0),
  closing_stock INTEGER NOT NULL DEFAULT 0 CHECK (closing_stock >= 0),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(shift_id, product_id)
);

-- =====================================================
-- CREATE CASH DENOMINATIONS TABLE
-- =====================================================
CREATE TABLE cash_denominations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shift_id UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  denomination INTEGER NOT NULL CHECK (denomination IN (1, 5, 10, 20, 50, 100, 200, 500, 1000)),
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  total DECIMAL(10, 2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(shift_id, denomination)
);

-- Create indexes
CREATE INDEX idx_shifts_branch ON shifts(branch_id);
CREATE INDEX idx_shifts_cashier ON shifts(cashier_id);
CREATE INDEX idx_shifts_date ON shifts(shift_date DESC);
CREATE INDEX idx_stock_counts_shift ON stock_counts(shift_id);
CREATE INDEX idx_stock_counts_product ON stock_counts(product_id);
CREATE INDEX idx_cash_denominations_shift ON cash_denominations(shift_id);

-- Create sequence for shift numbers
CREATE SEQUENCE shift_number_seq START 1;

-- Function to generate shift number
CREATE OR REPLACE FUNCTION generate_shift_number()
RETURNS BIGINT AS $$
BEGIN
  RETURN nextval('shift_number_seq');
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- ROW LEVEL SECURITY POLICIES
-- =====================================================

ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_denominations ENABLE ROW LEVEL SECURITY;

-- Cashiers: View shifts from their branch
CREATE POLICY "cashiers_view_branch_shifts" ON shifts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'cashier'
      AND profiles.branch_id = shifts.branch_id
    )
  );

-- Cashiers: Insert their own shifts
CREATE POLICY "cashiers_insert_own_shifts" ON shifts
  FOR INSERT
  WITH CHECK (
    cashier_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'cashier'
      AND profiles.branch_id = shifts.branch_id
    )
  );

-- Managers: View all shifts in their branch
CREATE POLICY "managers_view_branch_shifts" ON shifts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'manager'
      AND profiles.branch_id = shifts.branch_id
    )
  );

-- Admins: Full access
CREATE POLICY "admins_manage_shifts" ON shifts
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

-- Stock counts RLS (inherit from shifts)
CREATE POLICY "view_stock_counts_via_shift" ON stock_counts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM shifts
      WHERE shifts.id = stock_counts.shift_id
      AND (
        -- Cashiers can see their branch
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
          AND profiles.role = 'cashier'
          AND profiles.branch_id = shifts.branch_id
        )
        OR
        -- Managers can see their branch
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
          AND profiles.role = 'manager'
          AND profiles.branch_id = shifts.branch_id
        )
        OR
        -- Admins can see all
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
          AND profiles.role IN ('admin', 'superadmin')
        )
      )
    )
  );

CREATE POLICY "cashiers_insert_stock_counts" ON stock_counts
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM shifts
      WHERE shifts.id = stock_counts.shift_id
      AND shifts.cashier_id = auth.uid()
    )
  );

-- Cash denominations RLS (inherit from shifts)
CREATE POLICY "view_denominations_via_shift" ON cash_denominations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM shifts
      WHERE shifts.id = cash_denominations.shift_id
      AND (
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
          AND profiles.role = 'cashier'
          AND profiles.branch_id = shifts.branch_id
        )
        OR
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
          AND profiles.role = 'manager'
          AND profiles.branch_id = shifts.branch_id
        )
        OR
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
          AND profiles.role IN ('admin', 'superadmin')
        )
      )
    )
  );

CREATE POLICY "cashiers_insert_denominations" ON cash_denominations
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM shifts
      WHERE shifts.id = cash_denominations.shift_id
      AND shifts.cashier_id = auth.uid()
    )
  );

-- =====================================================
-- TRIGGERS
-- =====================================================

CREATE TRIGGER update_shifts_updated_at
  BEFORE UPDATE ON shifts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Get last shift's cash amount for balance brought down
CREATE OR REPLACE FUNCTION get_last_shift_cash(target_branch_id UUID)
RETURNS DECIMAL AS $$
DECLARE
  last_cash DECIMAL;
BEGIN
  SELECT cash_in_hand INTO last_cash
  FROM shifts
  WHERE branch_id = target_branch_id
  ORDER BY created_at DESC
  LIMIT 1;

  RETURN COALESCE(last_cash, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get today's expense total
CREATE OR REPLACE FUNCTION get_today_expense_total(target_branch_id UUID)
RETURNS DECIMAL AS $$
DECLARE
  expense_sum DECIMAL;
BEGIN
  SELECT COALESCE(SUM(total), 0) INTO expense_sum
  FROM expenses
  WHERE branch_id = target_branch_id
    AND expense_date = CURRENT_DATE;

  RETURN expense_sum;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE shifts IS 'End-of-shift reconciliation records';
COMMENT ON COLUMN shifts.balance_brought_down IS 'Cash from previous shift';
COMMENT ON COLUMN shifts.mpesa_amount IS 'M-Pesa payments received';
COMMENT ON COLUMN shifts.paybill_amount IS 'Paybill payments received';
COMMENT ON COLUMN shifts.expense_total IS 'Total expenses for the day';
COMMENT ON COLUMN shifts.cash_in_hand IS 'Physical cash counted (from denominations)';
COMMENT ON COLUMN shifts.grand_total IS 'Balance + Mpesa + Paybill + Cash - Expenses';

COMMENT ON TABLE stock_counts IS 'Stock count records per product per shift';
COMMENT ON COLUMN stock_counts.opening_stock IS 'Stock at start of shift';
COMMENT ON COLUMN stock_counts.additions IS 'Stock added during shift';
COMMENT ON COLUMN stock_counts.spoilt IS 'Damaged/wasted stock';
COMMENT ON COLUMN stock_counts.closing_stock IS 'Stock at end of shift';

COMMENT ON TABLE cash_denominations IS 'Physical cash breakdown by denomination';
COMMENT ON COLUMN cash_denominations.denomination IS 'KSh denomination (1, 5, 10, 20, 50, 100, 200, 500, 1000)';
COMMENT ON COLUMN cash_denominations.quantity IS 'Number of notes/coins';
COMMENT ON COLUMN cash_denominations.total IS 'denomination * quantity';
