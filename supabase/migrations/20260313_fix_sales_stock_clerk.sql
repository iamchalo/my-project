-- =====================================================
-- FIX: Sales & Stock page showing no data with Clerk auth
-- =====================================================
-- Root causes:
-- 1. get_my_role() fallback uses "profiles WHERE id = auth.uid()" — auth.uid()
--    returns NULL with Clerk (Clerk IDs are not valid UUIDs), so the fallback
--    always returns NULL → all RLS checks fail.
-- 2. get_my_role() fast path returns 'authenticated' from Clerk JWT (the Supabase
--    DB role), NOT the app role — so it short-circuits before DB lookup.
-- 3. get_my_profile_id() was DROPPED by restore migration (CASCADE) — needed
--    by cashier INSERT check.
-- 4. cashiers_insert_own_shifts uses "cashier_id = auth.uid()" → always NULL
--    mismatch → cashier shifts cannot be inserted.
-- 5. admins_manage_all_shifts uses "profiles.id = auth.uid()" → always NULL
--    → admin/superadmin see zero shifts.
-- 6. auth_logs.user_id is UUID but receives Clerk text IDs → silent insert failure.
--
-- Fix: Restore Clerk-safe helper functions + rewrite shifts/stock_counts RLS.
-- All existing data (shifts with cashier_id = profiles.id UUID) remains intact.
-- =====================================================

-- ── 1. Restore Clerk-safe helper functions ───────────────────────────────────

-- get_my_role(): skip 'authenticated' JWT role (Supabase DB role Clerk sets),
-- fall through to DB lookup via JWT sub (clerk_id)
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT AS $$
DECLARE
  jwt_role  TEXT;
  db_role   TEXT;
  clerk_sub TEXT;
BEGIN
  BEGIN
    jwt_role := nullif(current_setting('request.jwt.claims', true), '')::json->>'role';
  EXCEPTION WHEN OTHERS THEN
    jwt_role := NULL;
  END;

  -- Only use JWT role if it's an actual app role (not 'authenticated')
  IF jwt_role IS NOT NULL AND jwt_role != 'authenticated' THEN
    RETURN jwt_role;
  END IF;

  -- DB fallback: resolve via Clerk user ID in JWT sub
  BEGIN
    clerk_sub := nullif(current_setting('request.jwt.claims', true), '')::json->>'sub';
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;

  IF clerk_sub IS NULL THEN RETURN NULL; END IF;

  SELECT role INTO db_role FROM public.profiles WHERE clerk_id = clerk_sub;
  RETURN db_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;


-- get_my_branch(): same pattern — JWT first, then DB via clerk_id
CREATE OR REPLACE FUNCTION public.get_my_branch()
RETURNS UUID AS $$
DECLARE
  jwt_branch UUID;
  db_branch  UUID;
  clerk_sub  TEXT;
BEGIN
  BEGIN
    jwt_branch := (nullif(current_setting('request.jwt.claims', true), '')::json->>'branch_id')::uuid;
  EXCEPTION WHEN OTHERS THEN
    jwt_branch := NULL;
  END;

  IF jwt_branch IS NOT NULL THEN RETURN jwt_branch; END IF;

  BEGIN
    clerk_sub := nullif(current_setting('request.jwt.claims', true), '')::json->>'sub';
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;

  IF clerk_sub IS NULL THEN RETURN NULL; END IF;

  SELECT branch_id INTO db_branch FROM public.profiles WHERE clerk_id = clerk_sub;
  RETURN db_branch;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION public.get_my_branch() TO authenticated;


-- get_my_profile_id(): resolve Supabase profile UUID from Clerk JWT sub
-- Uses JWT sub directly (NOT auth.uid() which fails for Clerk)
CREATE OR REPLACE FUNCTION public.get_my_profile_id()
RETURNS UUID AS $$
  SELECT id FROM public.profiles
  WHERE clerk_id = (nullif(current_setting('request.jwt.claims', true), '')::json->>'sub')
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION public.get_my_profile_id() TO authenticated;


-- ── 2. Fix shifts RLS policies ───────────────────────────────────────────────

DROP POLICY IF EXISTS "cashiers_view_branch_shifts"   ON public.shifts;
DROP POLICY IF EXISTS "cashiers_insert_own_shifts"    ON public.shifts;
DROP POLICY IF EXISTS "cashiers_insert_shifts"        ON public.shifts;
DROP POLICY IF EXISTS "cashiers_update_own_shifts"    ON public.shifts;
DROP POLICY IF EXISTS "managers_manage_branch_shifts" ON public.shifts;
DROP POLICY IF EXISTS "managers_view_branch_shifts"   ON public.shifts;
DROP POLICY IF EXISTS "admins_manage_all_shifts"      ON public.shifts;
DROP POLICY IF EXISTS "admins_manage_shifts"          ON public.shifts;

-- Cashiers: view their branch's shifts
CREATE POLICY "cashiers_view_branch_shifts" ON public.shifts
  FOR SELECT
  USING (
    public.get_my_role() = 'cashier'
    AND branch_id = public.get_my_branch()
  );

-- Cashiers: insert reconciliation rows (is_active = false) or active shifts
CREATE POLICY "cashiers_insert_shifts" ON public.shifts
  FOR INSERT
  WITH CHECK (
    public.get_my_role() = 'cashier'
    AND branch_id = public.get_my_branch()
    AND cashier_id = public.get_my_profile_id()
  );

-- Cashiers: update their own shifts (e.g. end_shift marks is_active = false)
CREATE POLICY "cashiers_update_own_shifts" ON public.shifts
  FOR UPDATE
  USING (
    public.get_my_role() = 'cashier'
    AND cashier_id = public.get_my_profile_id()
  );

-- Managers: full access to their branch's shifts
CREATE POLICY "managers_manage_branch_shifts" ON public.shifts
  FOR ALL
  USING (
    public.get_my_role() = 'manager'
    AND branch_id = public.get_my_branch()
  );

-- Admins & Superadmins: full access to all shifts
CREATE POLICY "admins_manage_all_shifts" ON public.shifts
  FOR ALL
  USING (public.get_my_role() IN ('admin', 'superadmin'));


-- ── 3. Fix stock_counts RLS policies ────────────────────────────────────────

DROP POLICY IF EXISTS "cashiers_manage_own_stock_counts" ON public.stock_counts;
DROP POLICY IF EXISTS "cashiers_manage_stock_counts"     ON public.stock_counts;
DROP POLICY IF EXISTS "cashiers_view_stock_counts"       ON public.stock_counts;
DROP POLICY IF EXISTS "cashiers_insert_stock_counts"     ON public.stock_counts;
DROP POLICY IF EXISTS "view_stock_counts_via_shift"      ON public.stock_counts;
DROP POLICY IF EXISTS "managers_view_branch_stock_counts" ON public.stock_counts;
DROP POLICY IF EXISTS "admins_manage_all_stock_counts"   ON public.stock_counts;
DROP POLICY IF EXISTS "admins_full_access_stock_counts"  ON public.stock_counts;
DROP POLICY IF EXISTS "admins_manage_stock_counts"       ON public.stock_counts;

-- Cashiers: manage stock counts for their own shifts
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


-- ── 4. Fix auth_logs user_id column type ────────────────────────────────────
-- Clerk user IDs are text (e.g. "user_3AfUS05TdTQbJzW4kqdPzEber17"), not UUIDs.
-- Must drop dependent policies first, alter, then recreate.
DROP POLICY IF EXISTS "insert_own_auth_log" ON public.auth_logs;
DROP POLICY IF EXISTS "users_insert_own_auth_log" ON public.auth_logs;
DROP POLICY IF EXISTS "view_own_auth_logs" ON public.auth_logs;
DROP POLICY IF EXISTS "users_view_own_auth_logs" ON public.auth_logs;
DROP POLICY IF EXISTS "admins_view_all_auth_logs" ON public.auth_logs;

ALTER TABLE public.auth_logs ALTER COLUMN user_id TYPE TEXT;

-- Recreate policies using clerk_id text comparison
CREATE POLICY "insert_own_auth_log" ON public.auth_logs
  FOR INSERT
  WITH CHECK (
    user_id = (nullif(current_setting('request.jwt.claims', true), '')::json->>'sub')
  );

CREATE POLICY "view_own_auth_logs" ON public.auth_logs
  FOR SELECT
  USING (
    user_id = (nullif(current_setting('request.jwt.claims', true), '')::json->>'sub')
    OR public.get_my_role() IN ('admin', 'superadmin')
  );
