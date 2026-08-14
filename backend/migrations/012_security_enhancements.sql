-- backend/migrations/012_security_enhancements.sql
-- Adds login audit tracking and active session management.
-- NOTE: Row-level security was intentionally omitted. Enabling RLS
-- requires every query in your app to set a session variable first.
-- It is NOT a drop-in change. Evaluate separately if you need it.

-- Login attempt audit log (adds IP + UA tracking)
ALTER TABLE client_login_attempts
ADD COLUMN IF NOT EXISTS ip_address INET,
ADD COLUMN IF NOT EXISTS user_agent TEXT;

CREATE INDEX IF NOT EXISTS idx_client_login_ip
ON client_login_attempts(client_id, ip_address, success)
WHERE success = TRUE;

-- Table for tracking active sessions
-- Enables: concurrent session limits, admin kill-switch, audit trail
CREATE TABLE IF NOT EXISTS client_sessions (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  jti VARCHAR(36) NOT NULL UNIQUE,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_client_sessions_client
ON client_sessions(client_id);

CREATE INDEX IF NOT EXISTS idx_client_sessions_jti
ON client_sessions(jti);

CREATE INDEX IF NOT EXISTS idx_client_sessions_expires
ON client_sessions(expires_at);

-- Optional: cleanup old sessions periodically (run via cron/pg_cron)
-- DELETE FROM client_sessions WHERE expires_at < NOW();
