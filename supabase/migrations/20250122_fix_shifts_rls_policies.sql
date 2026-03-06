-- =====================================================
-- FIX SHIFTS AND STOCK_COUNTS RLS POLICIES
-- Add explicit public. schema to fix search_path issues
-- =====================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Cashiers can view branch shifts" ON shifts;
DROP POLICY IF EXISTS "Cashiers can start shifts" ON shifts;
DROP POLICY IF EXISTS "Cashiers can update own shifts" ON shifts;
DROP POLICY IF EXISTS "Managers can manage branch shifts" ON shifts;
DROP POLICY IF EXISTS "cashiers_view_branch_shifts" ON shifts;
DROP POLICY IF EXISTS "cashiers_insert_own_shifts" ON shifts;
DROP POLICY IF EXISTS "managers_view_branch_shifts" ON shifts;
DROP POLICY IF EXISTS "admins_manage_shifts" ON shifts;

-- Recreate policies with explicit public. schema

-- Cashiers can view shifts from their branch
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

-- Cashiers can insert their own shifts
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

-- Cashiers can update their own shifts
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

-- Managers can view and manage all shifts in their branch
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

-- Admins and Superadmins can view and manage all shifts
CREATE POLICY "admins_manage_all_shifts" ON public.shifts
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE public.profiles.id = auth.uid()
      AND public.profiles.role IN ('admin', 'superadmin')
    )
  );

-- =====================================================
-- FIX STOCK_COUNTS RLS POLICIES
-- =====================================================

DROP POLICY IF EXISTS "cashiers_manage_own_stock_counts" ON stock_counts;
DROP POLICY IF EXISTS "managers_view_branch_stock_counts" ON stock_counts;
DROP POLICY IF EXISTS "admins_manage_stock_counts" ON stock_counts;

-- Cashiers can manage stock counts for their own shifts
CREATE POLICY "cashiers_manage_own_stock_counts" ON public.stock_counts
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.shifts
      WHERE public.shifts.id = stock_counts.shift_id
      AND public.shifts.cashier_id = auth.uid()
    )
  );

-- Managers can view stock counts for their branch
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

-- Admins and Superadmins can view and manage all stock counts
CREATE POLICY "admins_manage_all_stock_counts" ON public.stock_counts
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE public.profiles.id = auth.uid()
      AND public.profiles.role IN ('admin', 'superadmin')
    )
  );
