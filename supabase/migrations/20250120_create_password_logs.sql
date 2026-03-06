-- Create password change audit logs table
CREATE TABLE IF NOT EXISTS password_change_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('request', 'success', 'failure')),
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('Africa/Nairobi', now()) NOT NULL
);

-- Create index on user_id for faster queries
CREATE INDEX IF NOT EXISTS idx_password_logs_user_id ON password_change_logs(user_id);

-- Create index on created_at for time-based queries
CREATE INDEX IF NOT EXISTS idx_password_logs_created_at ON password_change_logs(created_at DESC);

-- Enable Row Level Security
ALTER TABLE password_change_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (makes migration idempotent)
DROP POLICY IF EXISTS "Superadmins can view all password logs" ON password_change_logs;
DROP POLICY IF EXISTS "Users can view own password logs" ON password_change_logs;
DROP POLICY IF EXISTS "Anyone can insert password logs" ON password_change_logs;

-- Policy: Superadmins can view all logs
CREATE POLICY "Superadmins can view all password logs"
  ON password_change_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'superadmin'
    )
  );

-- Policy: Users can view their own logs
CREATE POLICY "Users can view own password logs"
  ON password_change_logs
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Policy: Anyone can insert logs (for password reset tracking)
CREATE POLICY "Anyone can insert password logs"
  ON password_change_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Add comment to table
COMMENT ON TABLE password_change_logs IS 'Audit log for password reset and change attempts';
COMMENT ON COLUMN password_change_logs.event_type IS 'Type of event: request (reset email sent), success (password changed), failure (failed attempt)';
