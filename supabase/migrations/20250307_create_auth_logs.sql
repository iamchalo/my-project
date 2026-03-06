-- =====================================================
-- CREATE AUTH LOGS TABLE
-- Tracks user login and logout events system-wide
-- =====================================================

CREATE TABLE auth_logs (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID        NOT NULL,
  user_name  TEXT        NOT NULL,
  role       TEXT        NOT NULL,
  branch     TEXT,                          -- branch name (null for admin/superadmin)
  action     TEXT        NOT NULL CHECK (action IN ('login', 'logout')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_auth_logs_created_at ON auth_logs(created_at DESC);
CREATE INDEX idx_auth_logs_user_id    ON auth_logs(user_id);
CREATE INDEX idx_auth_logs_action     ON auth_logs(action);
CREATE INDEX idx_auth_logs_role       ON auth_logs(role);

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE auth_logs ENABLE ROW LEVEL SECURITY;

-- Superadmins can read all logs (app-level filtering excludes other superadmins)
CREATE POLICY "superadmin_read_auth_logs" ON auth_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'superadmin'
    )
  );

-- Authenticated users can insert their own log entry
CREATE POLICY "insert_own_auth_log" ON auth_logs
  FOR INSERT
  WITH CHECK (user_id = auth.uid());
