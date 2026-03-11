-- =====================================================
-- COMPREHENSIVE FIX: ALL RLS POLICIES FOR CLERK AUTH
-- =====================================================
-- Root cause: auth.uid() with Clerk returns the Clerk user ID text
-- (e.g. "user_3AfUS05TdTQbJzW4kqdPzEber17"), NOT a UUID.
-- All policies using "profiles.id = auth.uid()" or
-- "cashier_id = auth.uid()" FAIL with this error:
--   invalid input syntax for type uuid: "user_3AfUS05TdTQbJzW4kqdPzEber17"
--
-- Fix strategy:
--   get_my_role()       → role from JWT claims          (Clerk-safe)
--   get_my_branch()     → branch_id from JWT claims     (Clerk-safe)
--   get_my_profile_id() → UUID from clerk_id = auth.uid()::text
-- =====================================================

-- ── 1. Helper functions ──────────────────────────────────────────────────────

-- Returns the Supabase profile UUID for the current Clerk user
CREATE OR REPLACE FUNCTION public.get_my_profile_id()
RETURNS UUID AS $$
  SELECT id FROM public.profiles WHERE clerk_id = auth.uid()::text LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION public.get_my_profile_id() TO authenticated;

-- Returns the role from JWT claims (with DB fallback via clerk_id)
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT AS $$
DECLARE
  jwt_role TEXT;
  db_role  TEXT;
BEGIN
  BEGIN
    jwt_role := nullif(current_setting('request.jwt.claims', true), '')::json->>'role';
  EXCEPTION WHEN OTHERS THEN
    jwt_role := NULL;
  END;

  IF jwt_role IS NOT NULL THEN RETURN jwt_role; END IF;

  SELECT role INTO db_role FROM public.profiles WHERE clerk_id = auth.uid()::text;
  RETURN db_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Returns the branch_id from JWT claims (with DB fallback via clerk_id)
CREATE OR REPLACE FUNCTION public.get_my_branch()
RETURNS UUID AS $$
DECLARE
  jwt_branch UUID;
  db_branch  UUID;
BEGIN
  BEGIN
    jwt_branch := (nullif(current_setting('request.jwt.claims', true), '')::json->>'branch_id')::uuid;
  EXCEPTION WHEN OTHERS THEN
    jwt_branch := NULL;
  END;

  IF jwt_branch IS NOT NULL THEN RETURN jwt_branch; END IF;

  SELECT branch_id INTO db_branch FROM public.profiles WHERE clerk_id = auth.uid()::text;
  RETURN db_branch;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ── 2. SHIFTS ────────────────────────────────────────────────────────────────

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
    public.get_my_role() = 'cashier'
    AND branch_id = public.get_my_branch()
  );

CREATE POLICY "cashiers_insert_shifts" ON public.shifts
  FOR INSERT
  WITH CHECK (
    public.get_my_role() = 'cashier'
    AND branch_id = public.get_my_branch()
    AND cashier_id = public.get_my_profile_id()
  );

CREATE POLICY "cashiers_update_own_shifts" ON public.shifts
  FOR UPDATE
  USING (
    public.get_my_role() = 'cashier'
    AND cashier_id = public.get_my_profile_id()
  );

CREATE POLICY "managers_view_branch_shifts" ON public.shifts
  FOR SELECT
  USING (
    public.get_my_role() = 'manager'
    AND branch_id = public.get_my_branch()
  );

CREATE POLICY "managers_manage_branch_shifts" ON public.shifts
  FOR ALL
  USING (
    public.get_my_role() = 'manager'
    AND branch_id = public.get_my_branch()
  );

CREATE POLICY "admins_manage_all_shifts" ON public.shifts
  FOR ALL
  USING (public.get_my_role() IN ('admin', 'superadmin'));

-- ── 3. STOCK_COUNTS ──────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "cashiers_manage_own_stock_counts"   ON public.stock_counts;
DROP POLICY IF EXISTS "cashiers_manage_stock_counts"       ON public.stock_counts;
DROP POLICY IF EXISTS "cashiers_view_stock_counts"         ON public.stock_counts;
DROP POLICY IF EXISTS "cashiers_insert_stock_counts"       ON public.stock_counts;
DROP POLICY IF EXISTS "view_stock_counts_via_shift"        ON public.stock_counts;
DROP POLICY IF EXISTS "managers_view_branch_stock_counts"  ON public.stock_counts;
DROP POLICY IF EXISTS "admins_manage_all_stock_counts"     ON public.stock_counts;
DROP POLICY IF EXISTS "admins_full_access_stock_counts"    ON public.stock_counts;
DROP POLICY IF EXISTS "admins_manage_stock_counts"         ON public.stock_counts;

CREATE POLICY "cashiers_manage_stock_counts" ON public.stock_counts
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.shifts s
      WHERE s.id = stock_counts.shift_id
        AND s.cashier_id = public.get_my_profile_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.shifts s
      WHERE s.id = stock_counts.shift_id
        AND s.cashier_id = public.get_my_profile_id()
    )
  );

CREATE POLICY "managers_view_branch_stock_counts" ON public.stock_counts
  FOR SELECT
  USING (
    public.get_my_role() = 'manager'
    AND EXISTS (
      SELECT 1 FROM public.shifts s
      WHERE s.id = stock_counts.shift_id
        AND s.branch_id = public.get_my_branch()
    )
  );

CREATE POLICY "admins_manage_all_stock_counts" ON public.stock_counts
  FOR ALL
  USING (public.get_my_role() IN ('admin', 'superadmin'));

-- ── 4. ORDERS ────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "cashiers_view_branch_orders"   ON public.orders;
DROP POLICY IF EXISTS "cashiers_insert_own_orders"    ON public.orders;
DROP POLICY IF EXISTS "managers_view_branch_orders"   ON public.orders;
DROP POLICY IF EXISTS "managers_update_branch_orders" ON public.orders;
DROP POLICY IF EXISTS "admins_view_all_orders"        ON public.orders;
DROP POLICY IF EXISTS "admins_manage_all_orders"      ON public.orders;

CREATE POLICY "cashiers_view_branch_orders" ON public.orders
  FOR SELECT
  USING (
    public.get_my_role() = 'cashier'
    AND branch_id = public.get_my_branch()
  );

CREATE POLICY "cashiers_insert_own_orders" ON public.orders
  FOR INSERT
  WITH CHECK (
    public.get_my_role() = 'cashier'
    AND branch_id = public.get_my_branch()
    AND cashier_id = public.get_my_profile_id()
  );

CREATE POLICY "managers_view_branch_orders" ON public.orders
  FOR SELECT
  USING (
    public.get_my_role() = 'manager'
    AND branch_id = public.get_my_branch()
  );

CREATE POLICY "managers_update_branch_orders" ON public.orders
  FOR UPDATE
  USING (
    public.get_my_role() = 'manager'
    AND branch_id = public.get_my_branch()
  );

CREATE POLICY "admins_manage_all_orders" ON public.orders
  FOR ALL
  USING (public.get_my_role() IN ('admin', 'superadmin'));

-- ── 5. ORDER_ITEMS ───────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "view_order_items_via_order"    ON public.order_items;
DROP POLICY IF EXISTS "cashiers_insert_order_items"   ON public.order_items;
DROP POLICY IF EXISTS "admins_manage_all_order_items" ON public.order_items;

CREATE POLICY "view_order_items_via_order" ON public.order_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND (
          (public.get_my_role() = 'cashier'  AND o.branch_id = public.get_my_branch())
          OR (public.get_my_role() = 'manager' AND o.branch_id = public.get_my_branch())
          OR public.get_my_role() IN ('admin', 'superadmin')
        )
    )
  );

CREATE POLICY "cashiers_insert_order_items" ON public.order_items
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.cashier_id = public.get_my_profile_id()
    )
  );

CREATE POLICY "admins_manage_all_order_items" ON public.order_items
  FOR ALL
  USING (public.get_my_role() IN ('admin', 'superadmin'));

-- ── 6. EXPENSES ──────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "cashiers_view_branch_expenses"   ON public.expenses;
DROP POLICY IF EXISTS "cashiers_insert_own_expenses"    ON public.expenses;
DROP POLICY IF EXISTS "managers_view_branch_expenses"   ON public.expenses;
DROP POLICY IF EXISTS "managers_update_branch_expenses" ON public.expenses;
DROP POLICY IF EXISTS "managers_delete_branch_expenses" ON public.expenses;
DROP POLICY IF EXISTS "managers_manage_branch_expenses" ON public.expenses;
DROP POLICY IF EXISTS "admins_view_all_expenses"        ON public.expenses;
DROP POLICY IF EXISTS "admins_manage_all_expenses"      ON public.expenses;

CREATE POLICY "cashiers_view_branch_expenses" ON public.expenses
  FOR SELECT
  USING (
    public.get_my_role() = 'cashier'
    AND branch_id = public.get_my_branch()
  );

CREATE POLICY "cashiers_insert_own_expenses" ON public.expenses
  FOR INSERT
  WITH CHECK (
    public.get_my_role() = 'cashier'
    AND branch_id = public.get_my_branch()
    AND cashier_id = public.get_my_profile_id()
  );

CREATE POLICY "managers_view_branch_expenses" ON public.expenses
  FOR SELECT
  USING (
    public.get_my_role() = 'manager'
    AND branch_id = public.get_my_branch()
  );

CREATE POLICY "managers_manage_branch_expenses" ON public.expenses
  FOR ALL
  USING (
    public.get_my_role() = 'manager'
    AND branch_id = public.get_my_branch()
  );

CREATE POLICY "admins_manage_all_expenses" ON public.expenses
  FOR ALL
  USING (public.get_my_role() IN ('admin', 'superadmin'));

-- ── 7. TRANSFERS ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "managers_view_own_branch_transfers"   ON public.transfers;
DROP POLICY IF EXISTS "managers_create_transfers"            ON public.transfers;
DROP POLICY IF EXISTS "managers_update_received_transfers"   ON public.transfers;
DROP POLICY IF EXISTS "admins_full_access_transfers"         ON public.transfers;

CREATE POLICY "managers_view_own_branch_transfers" ON public.transfers
  FOR SELECT
  TO authenticated
  USING (
    public.get_my_role() = 'manager'
    AND (from_branch = public.get_my_branch() OR to_branch = public.get_my_branch())
  );

CREATE POLICY "managers_create_transfers" ON public.transfers
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.get_my_role() = 'manager'
    AND from_branch = public.get_my_branch()
    AND created_by = public.get_my_profile_id()
  );

CREATE POLICY "managers_update_received_transfers" ON public.transfers
  FOR UPDATE
  TO authenticated
  USING (
    public.get_my_role() = 'manager'
    AND to_branch = public.get_my_branch()
  )
  WITH CHECK (
    public.get_my_role() = 'manager'
    AND to_branch = public.get_my_branch()
  );

CREATE POLICY "admins_full_access_transfers" ON public.transfers
  FOR ALL
  TO authenticated
  USING (public.get_my_role() IN ('admin', 'superadmin'));

-- ── 8. SHIFT_CHEF_ASSIGNMENTS ────────────────────────────────────────────────

DROP POLICY IF EXISTS "branch_staff_view_assignments" ON public.shift_chef_assignments;
DROP POLICY IF EXISTS "cashiers_insert_assignments"   ON public.shift_chef_assignments;
DROP POLICY IF EXISTS "cashiers_delete_assignments"   ON public.shift_chef_assignments;
DROP POLICY IF EXISTS "cashiers_manage_assignments"   ON public.shift_chef_assignments;
DROP POLICY IF EXISTS "managers_view_assignments"     ON public.shift_chef_assignments;
DROP POLICY IF EXISTS "admins_full_access_assignments" ON public.shift_chef_assignments;

-- Cashiers & managers: view assignments for their branch
CREATE POLICY "branch_staff_view_assignments" ON public.shift_chef_assignments
  FOR SELECT
  TO authenticated
  USING (
    branch_id = public.get_my_branch()
    AND public.get_my_role() IN ('cashier', 'manager')
  );

-- Cashiers: insert/delete assignments for active shifts at their branch
CREATE POLICY "cashiers_insert_assignments" ON public.shift_chef_assignments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.get_my_role() = 'cashier'
    AND branch_id = public.get_my_branch()
    AND assigned_by = public.get_my_profile_id()
    AND EXISTS (
      SELECT 1 FROM public.shifts
      WHERE id = shift_id AND is_active = true
        AND branch_id = public.get_my_branch()
    )
  );

CREATE POLICY "cashiers_delete_assignments" ON public.shift_chef_assignments
  FOR DELETE
  TO authenticated
  USING (
    public.get_my_role() = 'cashier'
    AND assigned_by = public.get_my_profile_id()
    AND EXISTS (
      SELECT 1 FROM public.shifts WHERE id = shift_id AND is_active = true
    )
  );

-- Admins full access
CREATE POLICY "admins_full_access_assignments" ON public.shift_chef_assignments
  FOR ALL
  TO authenticated
  USING (public.get_my_role() IN ('admin', 'superadmin'));
