-- The admin dashboard (public/admin/dashboard.js) renders company, status,
-- and expects an updated_at timestamp on each contact submission, but the
-- original schema (001_init.sql) only had name, email, message, created_at.
--
-- NOTE: an earlier version of this migration was accidentally committed
-- with a broken filename ("004 add contact details and status · SQL" - no
-- .sql extension), so it silently never ran. This is the corrected version.
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS company TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'new';
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Matches the status values dashboard.js actually offers in its dropdown:
-- new, read, replied, archived.
ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_status_check;
ALTER TABLE contacts ADD CONSTRAINT contacts_status_check
  CHECK (status IN ('new', 'read', 'replied', 'archived'));
