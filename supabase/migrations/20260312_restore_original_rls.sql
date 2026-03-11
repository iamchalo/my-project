-- =====================================================
-- RESTORE: ALL RLS POLICIES TO ORIGINAL STATE
-- =====================================================
-- This reverts all RLS changes made during the Clerk-fix sessions.
-- Returns every policy to the exact definitions in the original
-- migration files (profiles.id = auth.uid() pattern).
-- =====================================================

-- ── 1. Restore get_my_role() to original (id = auth.uid() fallback) ──────────
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT AS $$
DECLARE
  jwt_role TEXT;
  db_role TEXT;
BEGIN
  BEGIN
    jwt_role := COALESCE(
      nullif(current_setting('request.jwt.claims', true), '')::json->>'role',
      NULL
    )::text;
  EXCEPTION WHEN OTHERS THEN
    jwt_role := NULL;
  END;

  IF jwt_role IS NOT NULL THEN
    RETURN jwt_role;
  END IF;

  SELECT role INTO db_role FROM profiles WHERE id = auth.uid();
  RETURN db_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ── 2. Restore get_my_branch() to original (id = auth.uid() fallback) ─────────
CREATE OR REPLACE FUNCTION public.get_my_branch()
RETURNS UUID AS $$
DECLARE
  jwt_branch UUID;
  db_branch UUID;
BEGIN
  BEGIN
    jwt_branch := COALESCE(
      nullif(current_setting('request.jwt.claims', true), '')::json->>'branch_id',
      NULL
    )::uuid;
  EXCEPTION WHEN OTHERS THEN
    jwt_branch := NULL;
  END;

  IF jwt_branch IS NOT NULL THEN
    RETURN jwt_branch;
  END IF;

  SELECT branch_id INTO db_branch FROM profiles WHERE id = auth.uid();
  RETURN db_branch;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ── 3. Drop get_my_profile_id() (did not exist originally) ───────────────────
DROP FUNCTION IF EXISTS public.get_my_profile_id() CASCADE;

-- ── 4. SHIFTS — restore to 20250122_fix_shifts_rls_policies.sql ──────────────
DROP POLICY IF EXISTS "cashiers_view_branch_shifts"      ON public.shifts;
DROP POLICY IF EXISTS "cashiers_insert_own_shifts"       ON public.shifts;
DROP POLICY IF EXISTS "cashiers_insert_shifts"           ON public.shifts;
DROP POLICY IF EXISTS "cashiers_insert_reconciliation"   ON public.shifts;
DROP POLICY IF EXISTS "cashiers_update_own_shifts"       ON public.shifts;
DROP POLICY IF EXISTS "managers_manage_branch_shifts"    ON public.shifts;
DROP POLICY IF EXISTS "managers_view_branch_shifts"      ON public.shifts;
DROP POLICY IF EXISTS "admins_manage_all_shifts"         ON public.shifts;
DROP POLICY IF EXISTS "admins_manage_shifts"             ON public.shifts;

CREATE POLICY "cashiers_view_branch_shifts" ON public.shifts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE public.profiles.id = auth.uid()
      AND public.profiles.role = 'cashier'
      AND public.profiles.branch_id = shifts.branch_id
    )
  );

CREATE POLICY "cashiers_insert_own_shifts" ON public.shifts
  FOR INSERT
  WITH CHECK (
    cashier_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE public.profiles.id = auth.uid()
      AND public.profiles.role = 'cashier'
      AND public.profiles.branch_id = shifts.branch_id
    )
  );

CREATE POLICY "cashiers_update_own_shifts" ON public.shifts
  FOR UPDATE
  USING (
    cashier_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE public.profiles.id = auth.uid()
      AND public.profiles.role = 'cashier'
    )
  );

CREATE POLICY "managers_manage_branch_shifts" ON public.shifts
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE public.profiles.id = auth.uid()
      AND public.profiles.role = 'manager'
      AND public.profiles.branch_id = shifts.branch_id
    )
  );

CREATE POLICY "admins_manage_all_shifts" ON public.shifts
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE public.profiles.id = auth.uid()
      AND public.profiles.role IN ('admin', 'superadmin')
    )
  );

-- ── 5. STOCK_COUNTS — restore to 20250122_fix_shifts_rls_policies.sql ─────────
DROP POLICY IF EXISTS "cashiers_manage_own_stock_counts"   ON public.stock_counts;
DROP POLICY IF EXISTS "cashiers_manage_stock_counts"       ON public.stock_counts;
DROP POLICY IF EXISTS "cashiers_view_stock_counts"         ON public.stock_counts;
DROP POLICY IF EXISTS "cashiers_insert_stock_counts"       ON public.stock_counts;
DROP POLICY IF EXISTS "view_stock_counts_via_shift"        ON public.stock_counts;
DROP POLICY IF EXISTS "managers_view_branch_stock_counts"  ON public.stock_counts;
DROP POLICY IF EXISTS "admins_manage_all_stock_counts"     ON public.stock_counts;
DROP POLICY IF EXISTS "admins_full_access_stock_counts"    ON public.stock_counts;
DROP POLICY IF EXISTS "admins_manage_stock_counts"         ON public.stock_counts;

CREATE POLICY "cashiers_manage_own_stock_counts" ON public.stock_counts
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.shifts
      WHERE public.shifts.id = stock_counts.shift_id
      AND public.shifts.cashier_id = auth.uid()
    )
  );

CREATE POLICY "managers_view_branch_stock_counts" ON public.stock_counts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.shifts s
      JOIN public.profiles p ON p.id = auth.uid()
      WHERE s.id = stock_counts.shift_id
      AND p.role = 'manager'
      AND s.branch_id = p.branch_id
    )
  );

CREATE POLICY "admins_manage_all_stock_counts" ON public.stock_counts
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE public.profiles.id = auth.uid()
      AND public.profiles.role IN ('admin', 'superadmin')
    )
  );

-- ── 6. ORDERS — restore to 20250114_create_orders_optimized.sql ───────────────
DROP POLICY IF EXISTS "cashiers_view_branch_orders"   ON public.orders;
DROP POLICY IF EXISTS "cashiers_insert_own_orders"    ON public.orders;
DROP POLICY IF EXISTS "managers_view_branch_orders"   ON public.orders;
DROP POLICY IF EXISTS "managers_update_branch_orders" ON public.orders;
DROP POLICY IF EXISTS "admins_view_all_orders"        ON public.orders;
DROP POLICY IF EXISTS "admins_manage_all_orders"      ON public.orders;

CREATE POLICY "cashiers_view_branch_orders" ON orders
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'cashier'
      AND profiles.branch_id = orders.branch_id
    )
  );

CREATE POLICY "cashiers_insert_own_orders" ON orders
  FOR INSERT
  WITH CHECK (
    cashier_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'cashier'
      AND profiles.branch_id = orders.branch_id
    )
  );

CREATE POLICY "managers_view_branch_orders" ON orders
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'manager'
      AND profiles.branch_id = orders.branch_id
    )
  );

CREATE POLICY "managers_update_branch_orders" ON orders
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'manager'
      AND profiles.branch_id = orders.branch_id
    )
  );

CREATE POLICY "admins_view_all_orders" ON orders
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

CREATE POLICY "admins_manage_all_orders" ON orders
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

-- ── 7. ORDER_ITEMS — restore to 20250114_create_orders_optimized.sql ──────────
DROP POLICY IF EXISTS "view_order_items_via_order"    ON public.order_items;
DROP POLICY IF EXISTS "cashiers_insert_order_items"   ON public.order_items;
DROP POLICY IF EXISTS "admins_manage_all_order_items" ON public.order_items;

CREATE POLICY "view_order_items_via_order" ON order_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_items.order_id
      AND (
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
          AND profiles.role = 'cashier'
          AND profiles.branch_id = orders.branch_id
        )
        OR
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
          AND profiles.role = 'manager'
          AND profiles.branch_id = orders.branch_id
        )
        OR
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
          AND profiles.role IN ('admin', 'superadmin')
        )
      )
    )
  );

CREATE POLICY "cashiers_insert_order_items" ON order_items
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_items.order_id
      AND orders.cashier_id = auth.uid()
    )
  );

CREATE POLICY "admins_manage_all_order_items" ON order_items
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

-- ── 8. EXPENSES — restore to 20250114_create_expenses.sql ────────────────────
DROP POLICY IF EXISTS "cashiers_view_branch_expenses"   ON public.expenses;
DROP POLICY IF EXISTS "cashiers_insert_own_expenses"    ON public.expenses;
DROP POLICY IF EXISTS "managers_view_branch_expenses"   ON public.expenses;
DROP POLICY IF EXISTS "managers_update_branch_expenses" ON public.expenses;
DROP POLICY IF EXISTS "managers_delete_branch_expenses" ON public.expenses;
DROP POLICY IF EXISTS "managers_manage_branch_expenses" ON public.expenses;
DROP POLICY IF EXISTS "admins_view_all_expenses"        ON public.expenses;
DROP POLICY IF EXISTS "admins_manage_all_expenses"      ON public.expenses;

CREATE POLICY "cashiers_view_branch_expenses" ON expenses
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'cashier'
      AND profiles.branch_id = expenses.branch_id
    )
  );

CREATE POLICY "cashiers_insert_own_expenses" ON expenses
  FOR INSERT
  WITH CHECK (
    cashier_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'cashier'
      AND profiles.branch_id = expenses.branch_id
    )
  );

CREATE POLICY "managers_view_branch_expenses" ON expenses
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'manager'
      AND profiles.branch_id = expenses.branch_id
    )
  );

CREATE POLICY "managers_update_branch_expenses" ON expenses
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'manager'
      AND profiles.branch_id = expenses.branch_id
    )
  );

CREATE POLICY "managers_delete_branch_expenses" ON expenses
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'manager'
      AND profiles.branch_id = expenses.branch_id
    )
  );

CREATE POLICY "admins_view_all_expenses" ON expenses
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

CREATE POLICY "admins_manage_all_expenses" ON expenses
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

-- ── 9. TRANSFERS — restore to 20250305_create_transfers.sql ──────────────────
DROP POLICY IF EXISTS "managers_view_own_branch_transfers"   ON public.transfers;
DROP POLICY IF EXISTS "managers_create_transfers"            ON public.transfers;
DROP POLICY IF EXISTS "managers_update_received_transfers"   ON public.transfers;
DROP POLICY IF EXISTS "admins_full_access_transfers"         ON public.transfers;

CREATE POLICY "managers_view_own_branch_transfers" ON transfers
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'manager'
        AND (profiles.branch_id = transfers.from_branch
          OR profiles.branch_id = transfers.to_branch)
    )
  );

CREATE POLICY "managers_create_transfers" ON transfers
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'manager'
        AND profiles.branch_id = from_branch
    )
    AND created_by = auth.uid()
  );

CREATE POLICY "managers_update_received_transfers" ON transfers
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'manager'
        AND profiles.branch_id = transfers.to_branch
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'manager'
        AND profiles.branch_id = transfers.to_branch
    )
  );

CREATE POLICY "admins_full_access_transfers" ON transfers
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'superadmin')
    )
  );

-- ── 10. SHIFT_CHEF_ASSIGNMENTS — restore to 20250306_create_shift_chef_assignments.sql ──
DROP POLICY IF EXISTS "branch_staff_view_assignments" ON public.shift_chef_assignments;
DROP POLICY IF EXISTS "cashiers_insert_assignments"   ON public.shift_chef_assignments;
DROP POLICY IF EXISTS "cashiers_delete_assignments"   ON public.shift_chef_assignments;
DROP POLICY IF EXISTS "cashiers_manage_assignments"   ON public.shift_chef_assignments;
DROP POLICY IF EXISTS "managers_view_assignments"     ON public.shift_chef_assignments;
DROP POLICY IF EXISTS "admins_full_access_assignments" ON public.shift_chef_assignments;

CREATE POLICY "branch_staff_view_assignments" ON shift_chef_assignments
  FOR SELECT
  TO authenticated
  USING (
    branch_id IN (
      SELECT branch_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "cashiers_insert_assignments" ON shift_chef_assignments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    assigned_by = auth.uid()
    AND branch_id IN (
      SELECT branch_id FROM profiles WHERE id = auth.uid() AND role IN ('cashier', 'manager')
    )
    AND EXISTS (
      SELECT 1 FROM shifts
      WHERE id = shift_id AND is_active = true
        AND branch_id IN (SELECT branch_id FROM profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "cashiers_delete_assignments" ON shift_chef_assignments
  FOR DELETE
  TO authenticated
  USING (
    assigned_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM shifts WHERE id = shift_id AND is_active = true
    )
  );

CREATE POLICY "admins_full_access_assignments" ON shift_chef_assignments
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'superadmin')
    )
  );
