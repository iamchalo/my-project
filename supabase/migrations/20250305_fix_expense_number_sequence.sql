-- Fix generate_expense_number() function
-- The previous SET search_path = '' broke nextval() because the sequence
-- name was not schema-qualified. Fully qualifying it as public.expense_number_seq
-- makes the function work correctly even with an empty search path.

CREATE OR REPLACE FUNCTION public.generate_expense_number()
RETURNS BIGINT AS $$
BEGIN
  RETURN nextval('public.expense_number_seq');
END;
$$ LANGUAGE plpgsql;

-- Re-apply the empty search path for security (now safe because the sequence is fully qualified)
ALTER FUNCTION public.generate_expense_number() SET search_path = '';

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.generate_expense_number() TO authenticated;
