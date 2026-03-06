-- =====================================================
-- ENABLE RLS ON MISSING TABLES
-- =====================================================
-- Tables flagged by Supabase linter:
-- 1. orders_archive
-- 2. order_items_archive
-- 3. daily_summaries
-- 4. monthly_summaries
-- =====================================================

-- =====================================================
-- ORDERS_ARCHIVE RLS
-- =====================================================
ALTER TABLE orders_archive ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (makes migration idempotent)
DROP POLICY IF EXISTS "managers_view_branch_orders_archive" ON orders_archive;
DROP POLICY IF EXISTS "admins_manage_orders_archive" ON orders_archive;

-- Managers: View archived orders from their branch
CREATE POLICY "managers_view_branch_orders_archive" ON orders_archive
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'manager'
      AND profiles.branch_id = orders_archive.branch_id
    )
  );

-- Admins: Full access to archived orders
CREATE POLICY "admins_manage_orders_archive" ON orders_archive
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

-- =====================================================
-- ORDER_ITEMS_ARCHIVE RLS
-- =====================================================
ALTER TABLE order_items_archive ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (makes migration idempotent)
DROP POLICY IF EXISTS "managers_view_order_items_archive" ON order_items_archive;
DROP POLICY IF EXISTS "admins_manage_order_items_archive" ON order_items_archive;

-- View archived order items via parent order (managers)
CREATE POLICY "managers_view_order_items_archive" ON order_items_archive
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM orders_archive oa
      JOIN profiles p ON p.branch_id = oa.branch_id
      WHERE oa.id = order_items_archive.order_id
      AND p.id = auth.uid()
      AND p.role = 'manager'
    )
  );

-- Admins: Full access to archived order items
CREATE POLICY "admins_manage_order_items_archive" ON order_items_archive
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

-- =====================================================
-- DAILY_SUMMARIES RLS
-- =====================================================
ALTER TABLE daily_summaries ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (makes migration idempotent)
DROP POLICY IF EXISTS "cashiers_view_branch_daily_summaries" ON daily_summaries;
DROP POLICY IF EXISTS "managers_view_branch_daily_summaries" ON daily_summaries;
DROP POLICY IF EXISTS "admins_manage_daily_summaries" ON daily_summaries;

-- Cashiers: View summaries from their branch
CREATE POLICY "cashiers_view_branch_daily_summaries" ON daily_summaries
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'cashier'
      AND profiles.branch_id = daily_summaries.branch_id
    )
  );

-- Managers: View and manage summaries from their branch
CREATE POLICY "managers_view_branch_daily_summaries" ON daily_summaries
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'manager'
      AND profiles.branch_id = daily_summaries.branch_id
    )
  );

-- Admins: Full access to all daily summaries
CREATE POLICY "admins_manage_daily_summaries" ON daily_summaries
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

-- =====================================================
-- MONTHLY_SUMMARIES RLS
-- =====================================================
ALTER TABLE monthly_summaries ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (makes migration idempotent)
DROP POLICY IF EXISTS "cashiers_view_branch_monthly_summaries" ON monthly_summaries;
DROP POLICY IF EXISTS "managers_view_branch_monthly_summaries" ON monthly_summaries;
DROP POLICY IF EXISTS "admins_manage_monthly_summaries" ON monthly_summaries;

-- Cashiers: View summaries from their branch
CREATE POLICY "cashiers_view_branch_monthly_summaries" ON monthly_summaries
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'cashier'
      AND profiles.branch_id = monthly_summaries.branch_id
    )
  );

-- Managers: View summaries from their branch
CREATE POLICY "managers_view_branch_monthly_summaries" ON monthly_summaries
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'manager'
      AND profiles.branch_id = monthly_summaries.branch_id
    )
  );

-- Admins: Full access to all monthly summaries
CREATE POLICY "admins_manage_monthly_summaries" ON monthly_summaries
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

-- =====================================================
-- COMMENTS
-- =====================================================
COMMENT ON POLICY "managers_view_branch_orders_archive" ON orders_archive IS 'Managers can view archived orders from their branch';
COMMENT ON POLICY "admins_manage_orders_archive" ON orders_archive IS 'Admins can manage all archived orders';
COMMENT ON POLICY "managers_view_order_items_archive" ON order_items_archive IS 'Managers can view archived order items via parent order';
COMMENT ON POLICY "admins_manage_order_items_archive" ON order_items_archive IS 'Admins can manage all archived order items';
