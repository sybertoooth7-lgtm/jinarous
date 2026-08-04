-- Migration 005: Add audit_logs index
-- Fix #8: Index audit_logs.created_at for fast queries

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- Also index by admin_id if you query by user often
CREATE INDEX IF NOT EXISTS idx_audit_logs_admin_id ON audit_logs(admin_id);

-- And action type for filtering
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
