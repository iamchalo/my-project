-- =====================================================
-- CREATE EXPENSES TABLE
-- =====================================================
CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  expense_number BIGINT UNIQUE NOT NULL,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  cashier_id UUID NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  price DECIMAL(10, 2) NOT NULL CHECK (price >= 0),
  quantity SMALLINT NOT NULL CHECK (quantity > 0),
  total DECIMAL(10, 2) NOT NULL CHECK (total >= 0),
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_expenses_branch_id ON expenses(branch_id);
CREATE INDEX idx_expenses_cashier_id ON expenses(cashier_id);
CREATE INDEX idx_expenses_expense_date ON expenses(expense_date DESC);
CREATE INDEX idx_expenses_created_at ON expenses(created_at DESC);

-- Create sequence for expense numbers
CREATE SEQUENCE expense_number_seq START 1;

-- Function to generate sequential expense number
CREATE OR REPLACE FUNCTION generate_expense_number()
RETURNS BIGINT AS $$
BEGIN
  RETURN nextval('expense_number_seq');
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- ROW LEVEL SECURITY (RLS) POLICIES FOR EXPENSES
-- =====================================================

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

-- Cashiers: View expenses from their branch
CREATE POLICY "cashiers_view_branch_expenses" ON expenses
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'cashier'
      AND profiles.branch_id = expenses.branch_id
    )
  );

-- Cashiers: Insert their own expenses
CREATE POLICY "cashiers_insert_own_expenses" ON expenses
  FOR INSERT
  WITH CHECK (
    cashier_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'cashier'
      AND profiles.branch_id = expenses.branch_id
    )
  );

-- Managers: View and manage all expenses in their branch
CREATE POLICY "managers_view_branch_expenses" ON expenses
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'manager'
      AND profiles.branch_id = expenses.branch_id
    )
  );

CREATE POLICY "managers_update_branch_expenses" ON expenses
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'manager'
      AND profiles.branch_id = expenses.branch_id
    )
  );

CREATE POLICY "managers_delete_branch_expenses" ON expenses
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'manager'
      AND profiles.branch_id = expenses.branch_id
    )
  );

-- Admins: Full access to all expenses
CREATE POLICY "admins_view_all_expenses" ON expenses
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

CREATE POLICY "admins_manage_all_expenses" ON expenses
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Get expenses by branch and date
CREATE OR REPLACE FUNCTION get_expenses_by_branch_and_date(
  target_branch_id UUID,
  target_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  id UUID,
  expense_number BIGINT,
  cashier_name TEXT,
  description TEXT,
  price DECIMAL,
  quantity SMALLINT,
  total DECIMAL,
  expense_date DATE,
  created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.expense_number,
    p.full_name as cashier_name,
    e.description,
    e.price,
    e.quantity,
    e.total,
    e.expense_date,
    e.created_at
  FROM expenses e
  JOIN profiles p ON e.cashier_id = p.id
  WHERE e.branch_id = target_branch_id
    AND e.expense_date = target_date
  ORDER BY e.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get daily expense total
CREATE OR REPLACE FUNCTION get_daily_expense_total(
  target_branch_id UUID,
  target_date DATE DEFAULT CURRENT_DATE
)
RETURNS DECIMAL AS $$
DECLARE
  total_amount DECIMAL;
BEGIN
  SELECT COALESCE(SUM(total), 0)
  INTO total_amount
  FROM expenses
  WHERE branch_id = target_branch_id
    AND expense_date = target_date;

  RETURN total_amount;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON TABLE expenses IS 'Stores daily expenses logged by cashiers';
COMMENT ON COLUMN expenses.expense_number IS 'Sequential expense number';
COMMENT ON COLUMN expenses.description IS 'What the expense was for';
COMMENT ON COLUMN expenses.price IS 'Price per unit';
COMMENT ON COLUMN expenses.quantity IS 'Number of items/units';
COMMENT ON COLUMN expenses.total IS 'Total amount (price * quantity)';
COMMENT ON COLUMN expenses.expense_date IS 'Date of the expense (defaults to today)';
