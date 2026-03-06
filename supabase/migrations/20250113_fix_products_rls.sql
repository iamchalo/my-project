-- =====================================================
-- FIX PRODUCTS TABLE RLS - Use JWT Claims
-- =====================================================
-- Same issue as profiles table: policies query profiles table
-- causing infinite recursion. Use JWT claims instead.
-- =====================================================

-- Drop existing problematic policies
DROP POLICY IF EXISTS "cashiers_view_active_branch_products" ON products;
DROP POLICY IF EXISTS "managers_view_branch_products" ON products;
DROP POLICY IF EXISTS "managers_insert_branch_products" ON products;
DROP POLICY IF EXISTS "managers_update_branch_products" ON products;
DROP POLICY IF EXISTS "managers_delete_branch_products" ON products;
DROP POLICY IF EXISTS "admins_view_all_products" ON products;
DROP POLICY IF EXISTS "admins_manage_all_products" ON products;

-- ============================================
-- SELECT POLICIES (Using JWT claims)
-- ============================================

-- Cashiers: Can only view active products in their branch
CREATE POLICY "cashiers_view_active_branch_products" ON products
  FOR SELECT
  USING (
    is_active = true
    AND public.get_my_role() = 'cashier'
    AND public.get_my_branch() = products.branch_id
  );

-- Managers: Can view all products in their branch
CREATE POLICY "managers_view_branch_products" ON products
  FOR SELECT
  USING (
    public.get_my_role() = 'manager'
    AND public.get_my_branch() = products.branch_id
  );

-- Admins: Can view all products across all branches
CREATE POLICY "admins_view_all_products" ON products
  FOR SELECT
  USING (
    public.get_my_role() IN ('admin', 'superadmin')
  );

-- ============================================
-- INSERT POLICIES
-- ============================================

-- Managers: Can insert products in their branch
CREATE POLICY "managers_insert_branch_products" ON products
  FOR INSERT
  WITH CHECK (
    public.get_my_role() = 'manager'
    AND public.get_my_branch() = products.branch_id
  );

-- Admins: Can insert products in any branch
CREATE POLICY "admins_insert_all_products" ON products
  FOR INSERT
  WITH CHECK (
    public.get_my_role() IN ('admin', 'superadmin')
  );

-- ============================================
-- UPDATE POLICIES
-- ============================================

-- Managers: Can update products in their branch
CREATE POLICY "managers_update_branch_products" ON products
  FOR UPDATE
  USING (
    public.get_my_role() = 'manager'
    AND public.get_my_branch() = products.branch_id
  )
  WITH CHECK (
    public.get_my_role() = 'manager'
    AND public.get_my_branch() = products.branch_id
  );

-- Admins: Can update all products
CREATE POLICY "admins_update_all_products" ON products
  FOR UPDATE
  USING (
    public.get_my_role() IN ('admin', 'superadmin')
  )
  WITH CHECK (
    public.get_my_role() IN ('admin', 'superadmin')
  );

-- ============================================
-- DELETE POLICIES
-- ============================================

-- Managers: Can delete products in their branch
CREATE POLICY "managers_delete_branch_products" ON products
  FOR DELETE
  USING (
    public.get_my_role() = 'manager'
    AND public.get_my_branch() = products.branch_id
  );

-- Admins: Can delete all products
CREATE POLICY "admins_delete_all_products" ON products
  FOR DELETE
  USING (
    public.get_my_role() IN ('admin', 'superadmin')
  );

-- Verify the fix
SELECT
  'Products RLS policies fixed using JWT claims' as status,
  COUNT(*) as policy_count
FROM pg_policies
WHERE tablename = 'products';
