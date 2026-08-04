CREATE TABLE IF NOT EXISTS token_blocklist (
  jti UUID PRIMARY KEY,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_token_blocklist_expires_at 
  ON token_blocklist(expires_at);

CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  reset_time TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_reset_time 
  ON rate_limits(reset_time);
