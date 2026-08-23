-- Migration: 021_add_login_attempts_cleanup.sql
CREATE INDEX IF NOT EXISTS idx_client_login_attempts_created_at ON client_login_attempts(created_at);
