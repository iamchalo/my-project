-- Add category column to expenses table
-- Migration: Add expense categories (Production, Staff Foods, Home, Miscellaneous)

-- Add category column with default value for existing records
ALTER TABLE expenses
ADD COLUMN category TEXT NOT NULL DEFAULT 'Miscellaneous';

-- Add CHECK constraint to ensure only valid categories
ALTER TABLE expenses
ADD CONSTRAINT expenses_category_check
CHECK (category IN ('Production', 'Staff Foods', 'Home', 'Miscellaneous'));

-- Create index for faster filtering by category
CREATE INDEX idx_expenses_category ON expenses(category);

-- Update the comment on the table
COMMENT ON COLUMN expenses.category IS 'Expense category: Production, Staff Foods, Home, or Miscellaneous';

-- Grant necessary permissions (should already be set, but ensure consistency)
GRANT ALL ON expenses TO authenticated;
GRANT ALL ON expenses TO service_role;
