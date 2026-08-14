-- Migration 015: Account-level login lockout
-- Adds per-client failed-attempt tracking so brute-force attacks
-- can't evade IP-based blocking by rotating proxies.

ALTER TABLE clients
ADD COLUMN IF NOT EXISTS failed_login_count INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;
