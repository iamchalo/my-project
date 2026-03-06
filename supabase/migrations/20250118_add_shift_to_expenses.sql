-- Add shift column to expenses table
-- Shift: 'day' (7AM-7PM) or 'night' (7PM-7AM, counted on starting date)

-- Add shift column (allow NULL first, then set default)
ALTER TABLE expenses
ADD COLUMN IF NOT EXISTS shift TEXT DEFAULT 'day';

-- Add constraint separately
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'expenses_shift_check'
  ) THEN
    ALTER TABLE expenses ADD CONSTRAINT expenses_shift_check CHECK (shift IN ('day', 'night'));
  END IF;
END $$;

-- Create index for shift filtering (if not exists)
CREATE INDEX IF NOT EXISTS idx_expenses_shift ON expenses(shift);

-- Update existing expenses to set shift based on created_at time
-- Day shift: 7AM (07:00) to 7PM (19:00)
-- Night shift: 7PM (19:00) to 7AM (07:00) next day
UPDATE expenses
SET shift = CASE
  WHEN EXTRACT(HOUR FROM created_at AT TIME ZONE 'Africa/Nairobi') >= 7
       AND EXTRACT(HOUR FROM created_at AT TIME ZONE 'Africa/Nairobi') < 19
  THEN 'day'
  ELSE 'night'
END
WHERE shift IS NULL OR shift = 'day';

-- Create helper function to determine current shift
CREATE OR REPLACE FUNCTION get_current_shift()
RETURNS TEXT AS $$
DECLARE
  current_hour INTEGER;
BEGIN
  current_hour := EXTRACT(HOUR FROM NOW() AT TIME ZONE 'Africa/Nairobi');

  IF current_hour >= 7 AND current_hour < 19 THEN
    RETURN 'day';
  ELSE
    RETURN 'night';
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;

-- Create function to get expenses by branch with shift filter
CREATE OR REPLACE FUNCTION get_expenses_by_branch_date_shift(
  p_branch_id UUID,
  p_date DATE DEFAULT CURRENT_DATE,
  p_shift TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  expense_number BIGINT,
  cashier_id UUID,
  cashier_name TEXT,
  description TEXT,
  price DECIMAL,
  quantity SMALLINT,
  total DECIMAL,
  shift TEXT,
  expense_date DATE,
  created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.expense_number,
    e.cashier_id,
    p.full_name,
    e.description,
    e.price,
    e.quantity,
    e.total,
    e.shift,
    e.expense_date,
    e.created_at
  FROM expenses e
  JOIN profiles p ON e.cashier_id = p.id
  WHERE e.branch_id = p_branch_id
    AND e.expense_date = p_date
    AND (p_shift IS NULL OR e.shift = p_shift)
  ORDER BY e.created_at DESC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_expenses_by_branch_date_shift(UUID, DATE, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_current_shift() TO authenticated;

COMMENT ON COLUMN expenses.shift IS 'Work shift when expense was recorded: day (7AM-7PM) or night (7PM-7AM)';
