-- Migration: 020_add_admin_roles.sql

CREATE TYPE admin_role AS ENUM ('readonly', 'admin', 'superadmin');

ALTER TABLE admin_users
  ADD COLUMN IF NOT EXISTS role admin_role NOT NULL DEFAULT 'admin';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM admin_users WHERE role = 'superadmin') THEN
    UPDATE admin_users SET role = 'superadmin'
    WHERE id = (SELECT id FROM admin_users ORDER BY created_at ASC LIMIT 1);
  END IF;
END $$;
