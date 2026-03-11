-- =====================================================
-- FIX ALL SHIFTS / STOCK_COUNTS RLS FOR CLERK AUTH
-- =====================================================
-- Root cause: policies used profiles.id = auth.uid() but with
-- Clerk, auth.uid() returns the Clerk text ID (user_xxx), NOT
-- the Supabase UUID stored in profiles.id.
--
-- Fix strategy:
-- 1. Add get_my_profile_id() helper (Clerk-safe, SECURITY DEFINER)
-- 2. Fix get_my_role() / get_my_branch() fallbacks to use clerk_id
-- 3. Rewrite all cashier/manager policies for shifts & stock_counts
--    to use the JWT-claim helpers instead of profiles.id = auth.uid()
-- =====================================================

-- ── 1. Helper: resolve Supabase profile UUID from Clerk auth.uid() ──────────
CREATE OR REPLACE FUNCTION public.get_my_profile_id()
RETURNS UUID AS $$
  SELECT id FROM public.profiles WHERE clerk_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION public.get_my_profile_id() TO authenticated;

-- ── 2. Fix get_my_role() fallback to use clerk_id ───────────────────────────
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

  SELECT role INTO db_role FROM public.profiles WHERE clerk_id = auth.uid();
  RETURN db_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ── 3. Fix get_my_branch() fallback to use clerk_id ─────────────────────────
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

  SELECT branch_id INTO db_branch FROM public.profiles WHERE clerk_id = auth.uid();
  RETURN db_branch;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ── 4. Rebuild shifts RLS policies ──────────────────────────────────────────
DROP POLICY IF EXISTS "cashiers_view_branch_shifts"      ON public.shifts;
DROP POLICY IF EXISTS "cashiers_insert_own_shifts"       ON public.shifts;
DROP POLICY IF EXISTS "cashiers_insert_reconciliation"   ON public.shifts;
DROP POLICY IF EXISTS "cashiers_update_own_shifts"       ON public.shifts;
DROP POLICY IF EXISTS "managers_manage_branch_shifts"    ON public.shifts;
DROP POLICY IF EXISTS "managers_view_branch_shifts"      ON public.shifts;
DROP POLICY IF EXISTS "admins_manage_all_shifts"         ON public.shifts;

-- Cashiers: view shifts for their branch
CREATE POLICY "cashiers_view_branch_shifts" ON public.shifts
  FOR SELECT
  USING (
    public.get_my_role() = 'cashier'
    AND branch_id = public.get_my_branch()
  );

-- Cashiers: insert active shift (is_active = true, started via start_shift RPC)
-- AND reconciliation rows (is_active = false, from Sales & Stock form)
CREATE POLICY "cashiers_insert_shifts" ON public.shifts
  FOR INSERT
  WITH CHECK (
    public.get_my_role() = 'cashier'
    AND branch_id = public.get_my_branch()
    AND cashier_id = public.get_my_profile_id()
  );

-- Cashiers: update their own shifts (e.g. end_shift RPC marks is_active = false)
CREATE POLICY "cashiers_update_own_shifts" ON public.shifts
  FOR UPDATE
  USING (
    public.get_my_role() = 'cashier'
    AND cashier_id = public.get_my_profile_id()
  );

-- Managers: view all shifts in their branch
CREATE POLICY "managers_view_branch_shifts" ON public.shifts
  FOR SELECT
  USING (
    public.get_my_role() = 'manager'
    AND branch_id = public.get_my_branch()
  );

-- Admins & Superadmins: full access to all shifts
CREATE POLICY "admins_manage_all_shifts" ON public.shifts
  FOR ALL
  USING (public.get_my_role() IN ('admin', 'superadmin'));

-- ── 5. Rebuild stock_counts RLS policies ────────────────────────────────────
DROP POLICY IF EXISTS "cashiers_view_stock_counts"          ON public.stock_counts;
DROP POLICY IF EXISTS "cashiers_manage_own_stock_counts"    ON public.stock_counts;
DROP POLICY IF EXISTS "cashiers_insert_stock_counts"        ON public.stock_counts;
DROP POLICY IF EXISTS "view_stock_counts_via_shift"         ON public.stock_counts;
DROP POLICY IF EXISTS "managers_view_branch_stock_counts"   ON public.stock_counts;
DROP POLICY IF EXISTS "admins_manage_all_stock_counts"      ON public.stock_counts;
DROP POLICY IF EXISTS "admins_full_access_stock_counts"     ON public.stock_counts;

-- Cashiers: view & insert stock counts for their own shifts
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

-- Managers: view stock counts for their branch
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

-- Admins & Superadmins: full access
CREATE POLICY "admins_manage_all_stock_counts" ON public.stock_counts
  FOR ALL
  USING (public.get_my_role() IN ('admin', 'superadmin'));
