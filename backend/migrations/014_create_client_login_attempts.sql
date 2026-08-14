-- Migration 014: Client login attempt history
-- Every login attempt against /api/client/login gets logged here —
-- both successes and failures. This is distinct from Shield's
-- brute-force-triggered blocks (which fire only once a threshold is
-- crossed): this table gives the client full visibility into every
-- single attempt on their account, not just the ones that got blocked.
--
-- client_id is nullable on purpose: an attacker guessing random emails
-- that don't correspond to any real account still gets logged (useful
-- for admin visibility), but has no client to show it to.

CREATE TABLE IF NOT EXISTS client_login_attempts (
  id SERIAL PRIMARY KEY,
  client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  email_attempted TEXT NOT NULL,
  ip_address VARCHAR(45) NOT NULL,
  success BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_login_attempts_client ON client_login_attempts (client_id, created_at);
CREATE INDEX IF NOT EXISTS idx_client_login_attempts_created ON client_login_attempts (created_at);
