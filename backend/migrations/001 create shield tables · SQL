-- Migration: Shield module tables
-- Adjust the migration filename/number to match your existing migration sequence
-- (you mentioned GitHub's web editor has caused filename ordering issues before —
-- double check this lands after your latest migration, e.g. rename to 00X_ before pasting)

CREATE TABLE IF NOT EXISTS blocked_ips (
  id SERIAL PRIMARY KEY,
  ip_address VARCHAR(45) NOT NULL,
  reason VARCHAR(255) NOT NULL,
  severity VARCHAR(20) NOT NULL DEFAULT 'medium', -- low | medium | high | critical
  blocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ, -- NULL = permanent block
  auto_blocked BOOLEAN NOT NULL DEFAULT TRUE,
  hit_count INTEGER NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_blocked_ips_active
  ON blocked_ips (ip_address)
  WHERE expires_at IS NULL OR expires_at > NOW();

CREATE INDEX IF NOT EXISTS idx_blocked_ips_lookup ON blocked_ips (ip_address);

CREATE TABLE IF NOT EXISTS security_events (
  id SERIAL PRIMARY KEY,
  ip_address VARCHAR(45) NOT NULL,
  event_type VARCHAR(50) NOT NULL, -- sqli | xss | path_traversal | brute_force | rate_abuse
  severity VARCHAR(20) NOT NULL DEFAULT 'medium',
  request_path VARCHAR(500),
  request_method VARCHAR(10),
  matched_pattern VARCHAR(255),
  payload_snippet TEXT, -- truncated, sanitized sample of what triggered it
  blocked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_events_ip ON security_events (ip_address);
CREATE INDEX IF NOT EXISTS idx_security_events_created ON security_events (created_at);
CREATE INDEX IF NOT EXISTS idx_security_events_type ON security_events (event_type);
