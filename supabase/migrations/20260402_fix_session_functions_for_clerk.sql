-- =====================================================
-- FIX: Session management functions for Clerk auth
-- =====================================================
-- get_active_session_id, set_active_session, and
-- clear_active_session all used "WHERE id = auth.uid()"
-- which throws "invalid input syntax for type uuid"
-- with Clerk (Clerk IDs are text, not UUIDs).
--
-- Fix: Look up profile by clerk_id from JWT sub claim.
-- =====================================================

CREATE OR REPLACE FUNCTION get_active_session_id()
RETURNS UUID AS $$
  SELECT active_session_id FROM profiles
  WHERE clerk_id = (nullif(current_setting('request.jwt.claims', true), '')::json->>'sub');
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION set_active_session(p_session_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE profiles SET active_session_id = p_session_id
  WHERE clerk_id = (nullif(current_setting('request.jwt.claims', true), '')::json->>'sub');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION clear_active_session()
RETURNS VOID AS $$
BEGIN
  UPDATE profiles SET active_session_id = NULL
  WHERE clerk_id = (nullif(current_setting('request.jwt.claims', true), '')::json->>'sub');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_active_session_id()        TO authenticated;
GRANT EXECUTE ON FUNCTION set_active_session(UUID)       TO authenticated;
GRANT EXECUTE ON FUNCTION clear_active_session()         TO authenticated;
