-- Create shifts table for tracking cashier work shifts
-- Each branch can only have one active shift at a time

CREATE TABLE shifts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  cashier_id UUID NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  shift_type TEXT NOT NULL CHECK (shift_type IN ('day', 'night')),
  shift_date DATE NOT NULL DEFAULT CURRENT_DATE,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMP WITH TIME ZONE,
  total_sales DECIMAL(12, 2) DEFAULT 0,
  total_expenses DECIMAL(12, 2) DEFAULT 0,
  cash_handed_over DECIMAL(12, 2),
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX idx_shifts_branch_id ON shifts(branch_id);
CREATE INDEX idx_shifts_cashier_id ON shifts(cashier_id);
CREATE INDEX idx_shifts_shift_date ON shifts(shift_date DESC);
CREATE INDEX idx_shifts_is_active ON shifts(is_active) WHERE is_active = true;

-- Unique constraint: only one active shift per branch
CREATE UNIQUE INDEX idx_shifts_one_active_per_branch
ON shifts(branch_id)
WHERE is_active = true;

-- Enable RLS
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Cashiers can view shifts from their branch
CREATE POLICY "Cashiers can view branch shifts"
ON shifts FOR SELECT
TO authenticated
USING (
  branch_id IN (
    SELECT branch_id FROM profiles WHERE id = auth.uid()
  )
);

-- Cashiers can start their own shifts
CREATE POLICY "Cashiers can start shifts"
ON shifts FOR INSERT
TO authenticated
WITH CHECK (
  cashier_id = auth.uid()
  AND branch_id IN (
    SELECT branch_id FROM profiles WHERE id = auth.uid()
  )
);

-- Cashiers can end their own shifts
CREATE POLICY "Cashiers can update own shifts"
ON shifts FOR UPDATE
TO authenticated
USING (cashier_id = auth.uid())
WITH CHECK (cashier_id = auth.uid());

-- Managers can view and manage all branch shifts
CREATE POLICY "Managers can manage branch shifts"
ON shifts FOR ALL
TO authenticated
USING (
  branch_id IN (
    SELECT branch_id FROM profiles
    WHERE id = auth.uid()
    AND role IN ('manager', 'admin', 'superadmin')
  )
);

-- Function to determine shift type based on time
CREATE OR REPLACE FUNCTION determine_shift_type(check_time TIMESTAMP WITH TIME ZONE DEFAULT NOW())
RETURNS TEXT AS $$
DECLARE
  kenya_hour INTEGER;
BEGIN
  kenya_hour := EXTRACT(HOUR FROM check_time AT TIME ZONE 'Africa/Nairobi');

  IF kenya_hour >= 7 AND kenya_hour < 19 THEN
    RETURN 'day';
  ELSE
    RETURN 'night';
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to start a new shift
CREATE OR REPLACE FUNCTION start_shift(p_branch_id UUID, p_cashier_id UUID)
RETURNS UUID AS $$
DECLARE
  new_shift_id UUID;
  shift_type_val TEXT;
  shift_date_val DATE;
  kenya_hour INTEGER;
BEGIN
  -- Check if there's already an active shift for this branch
  IF EXISTS (SELECT 1 FROM shifts WHERE branch_id = p_branch_id AND is_active = true) THEN
    RAISE EXCEPTION 'There is already an active shift for this branch. Please end the current shift first.';
  END IF;

  -- Determine shift type and date
  kenya_hour := EXTRACT(HOUR FROM NOW() AT TIME ZONE 'Africa/Nairobi');

  IF kenya_hour >= 7 AND kenya_hour < 19 THEN
    shift_type_val := 'day';
    shift_date_val := (NOW() AT TIME ZONE 'Africa/Nairobi')::DATE;
  ELSE
    shift_type_val := 'night';
    -- For night shifts after midnight, use previous day's date
    IF kenya_hour < 7 THEN
      shift_date_val := ((NOW() AT TIME ZONE 'Africa/Nairobi') - INTERVAL '1 day')::DATE;
    ELSE
      shift_date_val := (NOW() AT TIME ZONE 'Africa/Nairobi')::DATE;
    END IF;
  END IF;

  -- Create new shift
  INSERT INTO shifts (branch_id, cashier_id, shift_type, shift_date)
  VALUES (p_branch_id, p_cashier_id, shift_type_val, shift_date_val)
  RETURNING id INTO new_shift_id;

  RETURN new_shift_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to end a shift and calculate totals
CREATE OR REPLACE FUNCTION end_shift(
  p_shift_id UUID,
  p_cash_handed_over DECIMAL DEFAULT 0,
  p_notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_branch_id UUID;
  v_shift_date DATE;
  v_shift_type TEXT;
  v_total_sales DECIMAL;
  v_total_expenses DECIMAL;
BEGIN
  -- Get shift details
  SELECT branch_id, shift_date, shift_type
  INTO v_branch_id, v_shift_date, v_shift_type
  FROM shifts
  WHERE id = p_shift_id AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shift not found or already ended';
  END IF;

  -- Calculate total sales for this shift
  -- This assumes orders table has a shift column or we filter by date and time
  SELECT COALESCE(SUM(total), 0)
  INTO v_total_sales
  FROM orders
  WHERE branch_id = v_branch_id
    AND order_date = v_shift_date
    AND shift = v_shift_type;

  -- Calculate total expenses for this shift
  SELECT COALESCE(SUM(total), 0)
  INTO v_total_expenses
  FROM expenses
  WHERE branch_id = v_branch_id
    AND expense_date = v_shift_date
    AND shift = v_shift_type;

  -- Update shift with totals and end time
  UPDATE shifts
  SET
    ended_at = NOW(),
    is_active = false,
    total_sales = v_total_sales,
    total_expenses = v_total_expenses,
    cash_handed_over = p_cash_handed_over,
    notes = p_notes
  WHERE id = p_shift_id;

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get active shift for a branch
CREATE OR REPLACE FUNCTION get_active_shift(p_branch_id UUID)
RETURNS TABLE (
  id UUID,
  cashier_id UUID,
  cashier_name TEXT,
  shift_type TEXT,
  shift_date DATE,
  started_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    s.cashier_id,
    p.full_name,
    s.shift_type,
    s.shift_date,
    s.started_at
  FROM shifts s
  JOIN profiles p ON s.cashier_id = p.id
  WHERE s.branch_id = p_branch_id
    AND s.is_active = true
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function to get shift history for a branch
CREATE OR REPLACE FUNCTION get_shift_history(
  p_branch_id UUID,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL,
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  cashier_id UUID,
  cashier_name TEXT,
  shift_type TEXT,
  shift_date DATE,
  started_at TIMESTAMP WITH TIME ZONE,
  ended_at TIMESTAMP WITH TIME ZONE,
  total_sales DECIMAL,
  total_expenses DECIMAL,
  cash_handed_over DECIMAL,
  is_active BOOLEAN,
  notes TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    s.cashier_id,
    p.full_name,
    s.shift_type,
    s.shift_date,
    s.started_at,
    s.ended_at,
    s.total_sales,
    s.total_expenses,
    s.cash_handed_over,
    s.is_active,
    s.notes
  FROM shifts s
  JOIN profiles p ON s.cashier_id = p.id
  WHERE s.branch_id = p_branch_id
    AND (p_start_date IS NULL OR s.shift_date >= p_start_date)
    AND (p_end_date IS NULL OR s.shift_date <= p_end_date)
  ORDER BY s.started_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION determine_shift_type(TIMESTAMP WITH TIME ZONE) TO authenticated;
GRANT EXECUTE ON FUNCTION start_shift(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION end_shift(UUID, DECIMAL, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_active_shift(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_shift_history(UUID, DATE, DATE, INTEGER) TO authenticated;

-- Comments
COMMENT ON TABLE shifts IS 'Tracks cashier work shifts with totals for handover';
COMMENT ON COLUMN shifts.shift_type IS 'day (7AM-7PM) or night (7PM-7AM)';
COMMENT ON COLUMN shifts.shift_date IS 'Date the shift belongs to (night shifts spanning midnight use start date)';
COMMENT ON COLUMN shifts.cash_handed_over IS 'Amount of cash handed over to next cashier at end of shift';
