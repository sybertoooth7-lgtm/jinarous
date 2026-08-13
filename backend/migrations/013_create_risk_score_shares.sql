-- Migration 013: Portable risk score verification links
-- A client's compliance score (computed on the fly from
-- client_compliance_status, not stored/duplicated) can be shared via a
-- random, unguessable token. Anyone with the link — a bank, insurer,
-- partner — can verify the score via GET /api/verify/:token with no
-- login required. The public view only ever returns the score, company
-- name, and issue date; never the underlying checklist detail.

CREATE TABLE IF NOT EXISTS risk_score_shares (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  token VARCHAR(64) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ, -- NULL = does not expire
  revoked_at TIMESTAMPTZ, -- set when the client/admin revokes early
  created_by TEXT -- admin email who generated it
);

CREATE INDEX IF NOT EXISTS idx_risk_score_shares_token ON risk_score_shares (token);
CREATE INDEX IF NOT EXISTS idx_risk_score_shares_client ON risk_score_shares (client_id);
