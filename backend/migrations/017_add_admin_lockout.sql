-- backend/migrations/017_add_admin_lockout.sql
--
-- Adds per-account lockout to admin_users, mirroring the client lockout
-- added in 015_add_client_lockout.sql. Before this, admin login was
-- protected only by the global IP-based Shield rate limiter
-- (recordFailedLogin) — a distributed attack (many source IPs, one
-- target admin email) would sail past that entirely, since there was no
-- second, per-account layer to fall back on. Client accounts already had
-- that second layer; admin accounts, the higher-value target, didn't.
--
-- Deliberately capped much shorter than the client version (30 min max
-- vs. 6 hours): a locked-out client can be helped by an admin, but a
-- locked-out sole admin has no one else to unlock them. This adds real
-- protection against distributed brute force without risking a
-- multi-hour full-platform lockout from a handful of failed attempts
-- against the only admin account.
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS failed_login_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;
