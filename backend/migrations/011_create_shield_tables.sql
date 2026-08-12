-- Migration 011: Shield module tables

CREATE TABLE IF NOT EXISTS blocked_ips (
  id SERIAL PRIMARY KEY,
  ip_address VARCHAR(45) NOT NULL UNIQUE,
  reason VARCHAR(255) NOT NULL,
  severity VARCHAR(20) NOT NULL DEFAULT 'medium', -- low | medium | high | critical
  blocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ, -- NULL = permanent block
  auto_blocked BOOLEAN NOT NULL DEFAULT TRUE,
  hit_count INTEGER NOT NULL DEFAULT 1
);

-- One row per IP, ever. "Is this IP currently blocked?" is answered by
-- checking expires_at at query time (see idx_blocked_ips_lookup below),
-- not by the uniqueness constraint itself.
--
-- NOTE: an earlier version of this migration tried a partial unique index
-- with `WHERE expires_at IS NULL OR expires_at > NOW()`, matching the
-- ON CONFLICT clause in blocklist.js. Postgres rejects that: index
-- predicates must be IMMUTABLE, and NOW() is not — its value changes
-- between calls, so it can't be baked into an index definition. Using a
-- plain UNIQUE(ip_address) instead sidesteps the issue entirely: an IP
-- that reoffends after its previous block expired just gets its existing
-- row updated in place (see blockIp() in blocklist.js), which is the
-- correct behavior anyway.
CREATE INDEX IF NOT EXISTS idx_blocked_ips_lookup ON blocked_ips (ip_address, expires_at);

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
