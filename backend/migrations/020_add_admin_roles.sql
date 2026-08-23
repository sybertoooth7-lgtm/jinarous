-- Migration: 020_add_admin_roles.sql
-- Adds role-based access control to admin_users.
-- Existing admins default to 'admin' (full access except user management).
-- The first admin should be manually promoted to 'superadmin' if needed.

CREATE TYPE admin_role AS ENUM ('readonly', 'admin', 'superadmin');

ALTER TABLE admin_users
  ADD COLUMN IF NOT EXISTS role admin_role NOT NULL DEFAULT 'admin';

-- Ensure at least one superadmin exists (promote the oldest admin if none)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM admin_users WHERE role = 'superadmin') THEN
    UPDATE admin_users
    SET role = 'superadmin'
    WHERE id = (SELECT id FROM admin_users ORDER BY created_at ASC LIMIT 1);
  END IF;
END $$;
