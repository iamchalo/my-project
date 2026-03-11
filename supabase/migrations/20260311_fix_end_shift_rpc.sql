-- =====================================================
-- FIX end_shift RPC
-- The original end_shift function referenced orders.order_date
-- and orders.shift columns which do not exist in the optimized
-- orders schema. This rewrite uses created_at timestamps for
-- order filtering and the correct expenses.shift column.
-- =====================================================

CREATE OR REPLACE FUNCTION end_shift(
  p_shift_id UUID,
  p_cash_handed_over DECIMAL DEFAULT 0,
  p_notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_branch_id    UUID;
  v_shift_date   DATE;
  v_shift_type   TEXT;
  v_started_at   TIMESTAMPTZ;
  v_total_sales  DECIMAL;
  v_total_expenses DECIMAL;
BEGIN
  -- Get shift details
  SELECT branch_id, shift_date, shift_type, started_at
  INTO v_branch_id, v_shift_date, v_shift_type, v_started_at
  FROM shifts
  WHERE id = p_shift_id AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shift not found or already ended';
  END IF;

  -- Calculate total sales for this shift using created_at timestamps
  -- (orders table has no order_date or shift column)
  SELECT COALESCE(SUM(total_amount), 0)
  INTO v_total_sales
  FROM orders
  WHERE branch_id = v_branch_id
    AND created_at >= v_started_at
    AND created_at <= NOW();

  -- Calculate total expenses using expense_date + shift columns
  SELECT COALESCE(SUM(total), 0)
  INTO v_total_expenses
  FROM expenses
  WHERE branch_id = v_branch_id
    AND expense_date = v_shift_date
    AND shift = v_shift_type;

  -- Mark shift as ended
  UPDATE shifts
  SET
    ended_at         = NOW(),
    is_active        = false,
    total_sales      = v_total_sales,
    total_expenses   = v_total_expenses,
    cash_handed_over = p_cash_handed_over,
    notes            = p_notes
  WHERE id = p_shift_id;

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION end_shift(UUID, DECIMAL, TEXT) TO authenticated;
