-- Performance indexes for frequently queried columns
-- Run this in Supabase SQL Editor or via migration

-- orders: branch_id, cashier_id, created_at (used for filtering/sorting on orders pages)
CREATE INDEX IF NOT EXISTS idx_orders_branch_id     ON orders (branch_id);
CREATE INDEX IF NOT EXISTS idx_orders_cashier_id    ON orders (cashier_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at    ON orders (created_at DESC);

-- order_items: order_id (used to fetch items for an order)
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items (order_id);

-- expenses: branch_id, cashier_id, expense_date, shift (used for filtering on expenses pages)
CREATE INDEX IF NOT EXISTS idx_expenses_branch_id    ON expenses (branch_id);
CREATE INDEX IF NOT EXISTS idx_expenses_cashier_id   ON expenses (cashier_id);
CREATE INDEX IF NOT EXISTS idx_expenses_expense_date ON expenses (expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_branch_date  ON expenses (branch_id, expense_date);

-- shifts: branch_id, shift_date, is_active (used for filtering on sales-stock pages)
CREATE INDEX IF NOT EXISTS idx_shifts_branch_id      ON shifts (branch_id);
CREATE INDEX IF NOT EXISTS idx_shifts_shift_date     ON shifts (shift_date);
CREATE INDEX IF NOT EXISTS idx_shifts_branch_date    ON shifts (branch_id, shift_date, is_active);

-- profiles: id is PK so already indexed; add branch_id for employee listing
CREATE INDEX IF NOT EXISTS idx_profiles_branch_id    ON profiles (branch_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role         ON profiles (role);

-- auth_logs: created_at (date-range queries), role, action (filtering)
CREATE INDEX IF NOT EXISTS idx_auth_logs_created_at  ON auth_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_logs_role        ON auth_logs (role);

-- employees: branch_id, is_active (filtering on employee pages)
CREATE INDEX IF NOT EXISTS idx_employees_branch_id   ON employees (branch_id);
CREATE INDEX IF NOT EXISTS idx_employees_is_active   ON employees (is_active);

-- stock_counts: shift_id (used to fetch stock for a shift)
CREATE INDEX IF NOT EXISTS idx_stock_counts_shift_id ON stock_counts (shift_id);

-- branch_products: branch_id, product_id (junction table lookups)
CREATE INDEX IF NOT EXISTS idx_branch_products_branch_id  ON branch_products (branch_id);
CREATE INDEX IF NOT EXISTS idx_branch_products_product_id ON branch_products (product_id);
