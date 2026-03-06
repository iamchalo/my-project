-- =====================================================
-- SIMPLE FIX: Products RLS Without Helper Functions
-- =====================================================
-- The helper functions don't work reliably in all contexts.
-- Solution: Query profiles table directly with proper checks
-- to avoid infinite recursion.
-- =====================================================

-- Re-enable RLS first
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies
DROP POLICY IF EXISTS "cashiers_view_active_branch_products" ON products;
DROP POLICY IF EXISTS "managers_view_branch_products" ON products;
DROP POLICY IF EXISTS "managers_insert_branch_products" ON products;
DROP POLICY IF EXISTS "managers_update_branch_products" ON products;
DROP POLICY IF EXISTS "managers_delete_branch_products" ON products;
DROP POLICY IF EXISTS "admins_view_all_products" ON products;
DROP POLICY IF EXISTS "admins_manage_all_products" ON products;
DROP POLICY IF EXISTS "admins_insert_all_products" ON products;
DROP POLICY IF EXISTS "admins_update_all_products" ON products;
DROP POLICY IF EXISTS "admins_delete_all_products" ON products;

-- ============================================
-- NEW SIMPLE POLICIES
-- ============================================

-- Cashiers: View active products in their branch
-- Direct subquery (profiles RLS already fixed with users_view_own_profile)
CREATE POLICY "cashiers_view_active_products" ON products
  FOR SELECT
  USING (
    is_active = true
    AND branch_id IN (
      SELECT branch_id
      FROM profiles
      WHERE id = auth.uid()
      AND role = 'cashier'
    )
  );

-- Managers: View all products in their branch
CREATE POLICY "managers_view_products" ON products
  FOR SELECT
  USING (
    branch_id IN (
      SELECT branch_id
      FROM profiles
      WHERE id = auth.uid()
      AND role = 'manager'
    )
  );

-- Managers: Insert products in their branch
CREATE POLICY "managers_insert_products" ON products
  FOR INSERT
  WITH CHECK (
    branch_id IN (
      SELECT branch_id
      FROM profiles
      WHERE id = auth.uid()
      AND role = 'manager'
    )
  );

-- Managers: Update products in their branch
CREATE POLICY "managers_update_products" ON products
  FOR UPDATE
  USING (
    branch_id IN (
      SELECT branch_id
      FROM profiles
      WHERE id = auth.uid()
      AND role = 'manager'
    )
  )
  WITH CHECK (
    branch_id IN (
      SELECT branch_id
      FROM profiles
      WHERE id = auth.uid()
      AND role = 'manager'
    )
  );

-- Managers: Delete products in their branch
CREATE POLICY "managers_delete_products" ON products
  FOR DELETE
  USING (
    branch_id IN (
      SELECT branch_id
      FROM profiles
      WHERE id = auth.uid()
      AND role = 'manager'
    )
  );

-- Admins: Full access to all products
CREATE POLICY "admins_all_products" ON products
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'superadmin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'superadmin')
    )
  );

-- Verify
SELECT
  'Products RLS fixed with direct queries' as status,
  COUNT(*) as policy_count
FROM pg_policies
WHERE tablename = 'products';
