-- Migration 022: Self-service signup + password reset for clients
--
-- clients, client_sessions, and token_blocklist already exist (since
-- migrations 001 and 005) — this migration only adds what's actually new:
-- the email_verified column, and two token tables. An earlier draft of
-- this migration used `CREATE TABLE IF NOT EXISTS clients (...)`, which
-- is a full no-op against an already-existing table (Postgres does not
-- merge column definitions) and would have silently never added
-- email_verified at all; it also tried to recreate token_blocklist's
-- index under the same name, which crashes outright. Verified against a
-- sandbox rebuild of the real 001–021 schema before writing this version.

ALTER TABLE clients
ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill: every client that existed before this migration was created
-- by an admin under the old flow, so treat them as already verified —
-- otherwise this migration would silently lock out every existing client
-- on their next login.
UPDATE clients SET email_verified = TRUE;

-- One row per outstanding verification link. Only the SHA-256 hash of the
-- token is stored (never the raw token), same pattern as token_blocklist's
-- jti. used_at (rather than deleting the row) lets a reused/replayed link
-- be told apart from one that simply expired.
CREATE TABLE IF NOT EXISTS client_email_verifications (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_client_email_verifications_client_id
  ON client_email_verifications(client_id);

-- Same shape for password-reset links.
CREATE TABLE IF NOT EXISTS client_password_resets (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_client_password_resets_client_id
  ON client_password_resets(client_id);
