-- =====================================================
-- FIX ADMIN/SUPERADMIN RLS FOR CLERK AUTH
-- =====================================================
-- Problem: Several tables have admin/superadmin RLS policies that use
--   profiles.id = auth.uid()
-- With Clerk auth, auth.uid() returns the Clerk user ID (text like "user_xxx"),
-- NOT the profiles.id UUID. So the check always fails → admins see empty data.
-- Fix: Use get_my_role() which reads role from JWT claims (already used by
-- products/branch_products after 20260309_fix_products_rls_for_clerk.sql)
-- =====================================================

-- =====================================================
-- SHIFTS TABLE
-- =====================================================
DROP POLICY IF EXISTS "admins_manage_all_shifts" ON public.shifts;

CREATE POLICY "admins_manage_all_shifts" ON public.shifts
  FOR ALL
  USING (public.get_my_role() IN ('admin', 'superadmin'));

-- =====================================================
-- STOCK_COUNTS TABLE
-- =====================================================
DROP POLICY IF EXISTS "admins_manage_all_stock_counts" ON public.stock_counts;

CREATE POLICY "admins_manage_all_stock_counts" ON public.stock_counts
  FOR ALL
  USING (public.get_my_role() IN ('admin', 'superadmin'));

-- =====================================================
-- SHIFT_CHEF_ASSIGNMENTS TABLE
-- =====================================================
DROP POLICY IF EXISTS "admins_full_access_assignments" ON public.shift_chef_assignments;

CREATE POLICY "admins_full_access_assignments" ON public.shift_chef_assignments
  FOR ALL
  TO authenticated
  USING (public.get_my_role() IN ('admin', 'superadmin'));

-- =====================================================
-- ORDERS TABLE
-- =====================================================
DROP POLICY IF EXISTS "admins_view_all_orders" ON public.orders;
DROP POLICY IF EXISTS "admins_manage_all_orders" ON public.orders;

CREATE POLICY "admins_view_all_orders" ON public.orders
  FOR SELECT
  USING (public.get_my_role() IN ('admin', 'superadmin'));

CREATE POLICY "admins_manage_all_orders" ON public.orders
  FOR ALL
  USING (public.get_my_role() IN ('admin', 'superadmin'));

-- =====================================================
-- ORDER_ITEMS TABLE
-- =====================================================
DROP POLICY IF EXISTS "admins_manage_all_order_items" ON public.order_items;

CREATE POLICY "admins_manage_all_order_items" ON public.order_items
  FOR ALL
  USING (public.get_my_role() IN ('admin', 'superadmin'));
