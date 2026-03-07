-- Add active_session_id column to profiles for single-session enforcement
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS active_session_id UUID DEFAULT NULL;

-- Set session nonce for calling user (SECURITY DEFINER bypasses restrictive RLS)
CREATE OR REPLACE FUNCTION set_active_session(p_session_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE profiles SET active_session_id = p_session_id WHERE id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Read session nonce for calling user
CREATE OR REPLACE FUNCTION get_active_session_id()
RETURNS UUID AS $$
  SELECT active_session_id FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Clear session on sign-out
CREATE OR REPLACE FUNCTION clear_active_session()
RETURNS VOID AS $$
BEGIN
  UPDATE profiles SET active_session_id = NULL WHERE id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION set_active_session(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_active_session_id() TO authenticated;
GRANT EXECUTE ON FUNCTION clear_active_session() TO authenticated;
