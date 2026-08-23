-- Migration: 019_add_mfa_to_admins.sql

ALTER TABLE admin_users
  ADD COLUMN IF NOT EXISTS mfa_secret TEXT,
  ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS mfa_backup_codes TEXT,
  ADD COLUMN IF NOT EXISTS mfa_enrolled_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_admin_users_mfa_enabled ON admin_users(mfa_enabled);
