-- Migration: 019_add_mfa_to_admins.sql
-- Adds TOTP MFA support for admin accounts.

ALTER TABLE admin_users
  ADD COLUMN IF NOT EXISTS mfa_secret TEXT,           -- encrypted TOTP secret (AES-256-GCM)
  ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS mfa_backup_codes TEXT,    -- JSON array of bcrypt-hashed backup codes
  ADD COLUMN IF NOT EXISTS mfa_enrolled_at TIMESTAMPTZ;

-- Index for quick MFA status checks during login
CREATE INDEX IF NOT EXISTS idx_admin_users_mfa_enabled ON admin_users(mfa_enabled);
