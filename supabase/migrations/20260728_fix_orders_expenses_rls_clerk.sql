-- =====================================================
-- FIX: orders / order_items / expenses / branch_inventory RLS for Clerk
-- =====================================================
-- These four tables were reverted to the pre-Clerk
-- "profiles.id = auth.uid()" pattern by 20260312_restore_original_rls.sql
-- and never fixed again. auth.uid() casts the JWT `sub` claim to uuid,
-- which breaks for Clerk's `user_xxx`-style ids.
--
-- This rewrites them onto the same get_my_role()/get_my_branch()/
-- get_my_profile_id() helpers already used by shifts/stock_counts
-- (see 20260313_fix_sales_stock_clerk.sql). Doing so also makes branch
-- scoping resolve to the cashier's ACTIVE branch (get_my_branch() was
-- redefined in 20260728_add_cashier_multi_branch.sql to read
-- profiles.active_branch_id), so multi-branch cashiers are correctly
-- scoped on these tables too.
-- =====================================================

-- =====================================================
-- ORDERS
-- =====================================================
DROP POLICY IF EXISTS "cashiers_view_branch_orders" ON orders;
DROP POLICY IF EXISTS "cashiers_insert_own_orders" ON orders;
DROP POLICY IF EXISTS "managers_view_branch_orders" ON orders;
DROP POLICY IF EXISTS "managers_update_branch_orders" ON orders;
DROP POLICY IF EXISTS "admins_view_all_orders" ON orders;
DROP POLICY IF EXISTS "admins_manage_all_orders" ON orders;

CREATE POLICY "cashiers_view_branch_orders" ON orders
  FOR SELECT
  USING (get_my_role() = 'cashier' AND branch_id = get_my_branch());

CREATE POLICY "cashiers_insert_own_orders" ON orders
  FOR INSERT
  WITH CHECK (
    cashier_id = get_my_profile_id()
    AND get_my_role() = 'cashier'
    AND branch_id = get_my_branch()
  );

CREATE POLICY "managers_view_branch_orders" ON orders
  FOR SELECT
  USING (get_my_role() = 'manager' AND branch_id = get_my_branch());

CREATE POLICY "managers_update_branch_orders" ON orders
  FOR UPDATE
  USING (get_my_role() = 'manager' AND branch_id = get_my_branch());

CREATE POLICY "admins_view_all_orders" ON orders
  FOR SELECT
  USING (get_my_role() IN ('admin', 'superadmin'));

CREATE POLICY "admins_manage_all_orders" ON orders
  FOR ALL
  USING (get_my_role() IN ('admin', 'superadmin'));

-- =====================================================
-- ORDER_ITEMS
-- =====================================================
DROP POLICY IF EXISTS "view_order_items_via_order" ON order_items;
DROP POLICY IF EXISTS "cashiers_insert_order_items" ON order_items;
DROP POLICY IF EXISTS "admins_manage_all_order_items" ON order_items;

CREATE POLICY "view_order_items_via_order" ON order_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_items.order_id
      AND (
        (get_my_role() = 'cashier' AND orders.branch_id = get_my_branch())
        OR (get_my_role() = 'manager' AND orders.branch_id = get_my_branch())
        OR get_my_role() IN ('admin', 'superadmin')
      )
    )
  );

CREATE POLICY "cashiers_insert_order_items" ON order_items
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_items.order_id
      AND orders.cashier_id = get_my_profile_id()
    )
  );

CREATE POLICY "admins_manage_all_order_items" ON order_items
  FOR ALL
  USING (get_my_role() IN ('admin', 'superadmin'));

-- =====================================================
-- EXPENSES
-- =====================================================
DROP POLICY IF EXISTS "cashiers_view_branch_expenses" ON expenses;
DROP POLICY IF EXISTS "cashiers_insert_own_expenses" ON expenses;
DROP POLICY IF EXISTS "managers_view_branch_expenses" ON expenses;
DROP POLICY IF EXISTS "managers_update_branch_expenses" ON expenses;
DROP POLICY IF EXISTS "managers_delete_branch_expenses" ON expenses;
DROP POLICY IF EXISTS "admins_view_all_expenses" ON expenses;
DROP POLICY IF EXISTS "admins_manage_all_expenses" ON expenses;

CREATE POLICY "cashiers_view_branch_expenses" ON expenses
  FOR SELECT
  USING (get_my_role() = 'cashier' AND branch_id = get_my_branch());

CREATE POLICY "cashiers_insert_own_expenses" ON expenses
  FOR INSERT
  WITH CHECK (
    cashier_id = get_my_profile_id()
    AND get_my_role() = 'cashier'
    AND branch_id = get_my_branch()
  );

CREATE POLICY "managers_view_branch_expenses" ON expenses
  FOR SELECT
  USING (get_my_role() = 'manager' AND branch_id = get_my_branch());

CREATE POLICY "managers_update_branch_expenses" ON expenses
  FOR UPDATE
  USING (get_my_role() = 'manager' AND branch_id = get_my_branch());

CREATE POLICY "managers_delete_branch_expenses" ON expenses
  FOR DELETE
  USING (get_my_role() = 'manager' AND branch_id = get_my_branch());

CREATE POLICY "admins_view_all_expenses" ON expenses
  FOR SELECT
  USING (get_my_role() IN ('admin', 'superadmin'));

CREATE POLICY "admins_manage_all_expenses" ON expenses
  FOR ALL
  USING (get_my_role() IN ('admin', 'superadmin'));

-- =====================================================
-- BRANCH_INVENTORY
-- =====================================================
-- Previously had zero cashier/manager policies (admin-only). Adding
-- branch-scoped read access for cashiers/managers via get_my_branch()
-- so multi-branch cashiers see the right branch's inventory. Admin
-- policy is rewritten onto the Clerk-safe helpers for consistency.
DROP POLICY IF EXISTS "admins_full_access_inventory" ON branch_inventory;

CREATE POLICY "admins_full_access_inventory" ON branch_inventory
  FOR ALL
  TO authenticated
  USING (get_my_role() IN ('admin', 'superadmin'))
  WITH CHECK (get_my_role() IN ('admin', 'superadmin'));

CREATE POLICY "cashiers_view_branch_inventory" ON branch_inventory
  FOR SELECT
  TO authenticated
  USING (get_my_role() = 'cashier' AND branch_id = get_my_branch());

CREATE POLICY "managers_view_branch_inventory" ON branch_inventory
  FOR SELECT
  TO authenticated
  USING (get_my_role() = 'manager' AND branch_id = get_my_branch());
