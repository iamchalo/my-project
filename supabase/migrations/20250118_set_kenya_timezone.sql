-- Migration: Set database timezone to Kenya (Africa/Nairobi, UTC+3)
-- This ensures all CURRENT_DATE and NOW() functions return Kenya time

-- Set the timezone for this database
ALTER DATABASE postgres SET timezone TO 'Africa/Nairobi';

-- Also set it for the current session (immediate effect)
SET timezone TO 'Africa/Nairobi';

-- Create helper functions that explicitly use Kenya timezone
-- These can be used throughout the application for consistency

-- Get current date in Kenya timezone
CREATE OR REPLACE FUNCTION get_kenya_date()
RETURNS DATE AS $$
BEGIN
  RETURN (NOW() AT TIME ZONE 'Africa/Nairobi')::DATE;
END;
$$ LANGUAGE plpgsql STABLE;

-- Get current timestamp in Kenya timezone
CREATE OR REPLACE FUNCTION get_kenya_timestamp()
RETURNS TIMESTAMP AS $$
BEGIN
  RETURN NOW() AT TIME ZONE 'Africa/Nairobi';
END;
$$ LANGUAGE plpgsql STABLE;

-- Update the get_daily_expense_total function to use Kenya timezone
CREATE OR REPLACE FUNCTION get_daily_expense_total(
  target_branch_id UUID,
  target_date DATE DEFAULT NULL
)
RETURNS NUMERIC AS $$
DECLARE
  total_amount NUMERIC;
  effective_date DATE;
BEGIN
  -- Use provided date or Kenya's current date
  effective_date := COALESCE(target_date, (NOW() AT TIME ZONE 'Africa/Nairobi')::DATE);

  SELECT COALESCE(SUM(total), 0)
  INTO total_amount
  FROM expenses
  WHERE branch_id = target_branch_id
    AND expense_date = effective_date;

  RETURN total_amount;
END;
$$ LANGUAGE plpgsql STABLE;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_kenya_date() TO authenticated;
GRANT EXECUTE ON FUNCTION get_kenya_timestamp() TO authenticated;
GRANT EXECUTE ON FUNCTION get_daily_expense_total(UUID, DATE) TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION get_kenya_date() IS 'Returns current date in Kenya timezone (Africa/Nairobi, UTC+3)';
COMMENT ON FUNCTION get_kenya_timestamp() IS 'Returns current timestamp in Kenya timezone (Africa/Nairobi, UTC+3)';
