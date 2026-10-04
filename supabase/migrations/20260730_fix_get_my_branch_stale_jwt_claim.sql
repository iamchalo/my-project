-- =====================================================
-- FIX: get_my_branch() was resolving to a stale Clerk JWT claim
-- instead of profiles.active_branch_id
-- =====================================================
-- get_my_branch() checked a `branch_id` claim on the Clerk-issued JWT
-- FIRST, and only fell back to profiles.active_branch_id if that claim
-- was absent. The JWT claim is baked in at token-issue time and is
-- never refreshed when a cashier switches branches via
-- set_active_branch() (20260728_add_cashier_multi_branch.sql) — that
-- RPC only updates the Postgres row, it cannot touch an already-issued
-- Clerk token. Result: a cashier picking BeFries on /select-branch
-- still had every RLS check (including the orders INSERT policy)
-- resolve to their stale/original branch (e.g. StageBeFries), silently
-- merging new orders into the wrong branch.
--
-- profiles.active_branch_id is documented as the source of truth for
-- get_my_branch() (see column comment added in
-- 20260728_add_cashier_multi_branch.sql) — this migration makes the
-- function actually honor that by removing the JWT short-circuit.
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_my_branch()
RETURNS UUID AS $$
DECLARE
  db_branch UUID;
  clerk_sub TEXT;
BEGIN
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
