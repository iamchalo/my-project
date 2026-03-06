-- Drop old schema (had phone/code columns designed for SMS, not email)
DROP TABLE IF EXISTS password_reset_tokens;

-- Recreate with proper email-based reset schema
CREATE TABLE password_reset_tokens (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash  VARCHAR(64) NOT NULL UNIQUE,   -- SHA-256 hex = 64 chars
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  used        BOOLEAN     NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_prt_user_id    ON password_reset_tokens(user_id);
CREATE INDEX idx_prt_token_hash ON password_reset_tokens(token_hash);
CREATE INDEX idx_prt_expires_at ON password_reset_tokens(expires_at);

-- RLS enabled; no direct client access — all ops go through service_role API routes
ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;

-- Periodic cleanup: called by a cron job or pg_cron
CREATE OR REPLACE FUNCTION cleanup_expired_reset_tokens()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  DELETE FROM public.password_reset_tokens
  WHERE expires_at < NOW() OR used = TRUE;
END;
$$;

-- Only service_role (server-side API routes) may read/write this table
GRANT ALL ON public.password_reset_tokens TO service_role;
REVOKE ALL ON public.password_reset_tokens FROM authenticated, anon;
