-- =====================================================
-- MULTI-BRANCH CASHIER ACCOUNTS
-- =====================================================
-- A cashier keeps one home branch (profiles.branch_id) but can now
-- also be authorized for additional branches (cashier_branches) and
-- picks which one is "active" for the current login
-- (profiles.active_branch_id). get_my_branch() is redefined to
-- resolve the active branch, so every RLS policy built on top of it
-- (shifts, stock_counts, and — after the companion migration —
-- orders/order_items/expenses/branch_inventory) automatically scopes
-- to whichever branch the cashier picked at login.
-- =====================================================

-- =====================================================
-- 1. profiles.active_branch_id
-- =====================================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS active_branch_id UUID REFERENCES branches(id);

-- Backfill: everyone's active branch starts as their home branch.
-- Non-cashiers and single-branch cashiers never change this, so
-- behavior is unchanged for them.
UPDATE profiles SET active_branch_id = branch_id WHERE active_branch_id IS NULL;

-- =====================================================
-- 2. cashier_branches — additional branches a cashier is authorized for
-- =====================================================
CREATE TABLE IF NOT EXISTS cashier_branches (
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  branch_id  UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (profile_id, branch_id)
);

CREATE INDEX IF NOT EXISTS idx_cashier_branches_profile_id ON cashier_branches(profile_id);

ALTER TABLE cashier_branches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_full_access_cashier_branches" ON cashier_branches
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = get_my_profile_id()
        AND profiles.role IN ('admin', 'superadmin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = get_my_profile_id()
        AND profiles.role IN ('admin', 'superadmin')
    )
  );

CREATE POLICY "cashiers_view_own_branches" ON cashier_branches
  FOR SELECT
  TO authenticated
  USING (profile_id = get_my_profile_id());

GRANT SELECT ON cashier_branches TO authenticated;
GRANT ALL ON cashier_branches TO service_role;

-- =====================================================
-- 3. get_my_branch() now resolves the ACTIVE branch
-- =====================================================
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

  SELECT COALESCE(active_branch_id, branch_id) INTO db_branch
  FROM public.profiles WHERE clerk_id = clerk_sub;
  RETURN db_branch;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- =====================================================
-- 4. get_my_allowed_branches() — branches this cashier may pick from
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_my_allowed_branches()
RETURNS TABLE (id UUID, name TEXT, code TEXT) AS $$
  SELECT b.id, b.name, b.code
  FROM public.branches b
  WHERE b.is_active = true
    AND (
      b.id = (
        SELECT p.branch_id FROM public.profiles p
        WHERE p.clerk_id = (nullif(current_setting('request.jwt.claims', true), '')::json->>'sub')
      )
      OR b.id IN (
        SELECT cb.branch_id FROM public.cashier_branches cb
        JOIN public.profiles p ON p.id = cb.profile_id
        WHERE p.clerk_id = (nullif(current_setting('request.jwt.claims', true), '')::json->>'sub')
      )
    )
  ORDER BY b.name;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION public.get_my_allowed_branches() TO authenticated;

-- =====================================================
-- 5. set_active_branch() — pick which authorized branch is active
-- =====================================================
CREATE OR REPLACE FUNCTION public.set_active_branch(p_branch_id UUID)
RETURNS VOID AS $$
DECLARE
  v_profile_id  UUID;
  v_home_branch UUID;
  v_allowed     BOOLEAN;
BEGIN
  SELECT id, branch_id INTO v_profile_id, v_home_branch
  FROM public.profiles
  WHERE clerk_id = (nullif(current_setting('request.jwt.claims', true), '')::json->>'sub');

  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  v_allowed := (p_branch_id = v_home_branch) OR EXISTS (
    SELECT 1 FROM public.cashier_branches
    WHERE profile_id = v_profile_id AND branch_id = p_branch_id
  );

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Not authorized for this branch';
  END IF;

  UPDATE public.profiles SET active_branch_id = p_branch_id WHERE id = v_profile_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.set_active_branch(UUID) TO authenticated;

COMMENT ON COLUMN profiles.branch_id IS 'Home branch (admin-assigned, used for reporting/admin UI)';
COMMENT ON COLUMN profiles.active_branch_id IS 'Branch the cashier picked at login; falls back to branch_id. Source of truth for get_my_branch().';
COMMENT ON TABLE cashier_branches IS 'Additional branches (beyond the home branch) a cashier is authorized to work at';
