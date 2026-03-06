-- Set expense_number column to auto-generate from the sequence directly.
-- This removes the need for the generate_expense_number() RPC call entirely,
-- which was broken by the SET search_path = '' security migration.

ALTER TABLE public.expenses
  ALTER COLUMN expense_number SET DEFAULT nextval('public.expense_number_seq');

-- Make the sequence owned by the column so it drops together with the table
ALTER SEQUENCE public.expense_number_seq OWNED BY public.expenses.expense_number;
