-- Stores the results of security tools run from the admin dashboard (e.g.
-- "Run Access Control Audit" against a lead's URL), so results are a real,
-- persisted report a client engagement can be built on - not just a
-- one-off popup that disappears when the page is closed.

CREATE TABLE IF NOT EXISTS tool_runs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  tool         TEXT NOT NULL,             -- e.g. 'auth_audit'
  target       TEXT NOT NULL,             -- the URL/domain that was audited
  status       TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','failed')),
  summary_json TEXT,                      -- {"PASS": n, "WARN": n, "FAIL": n, "INFO": n}
  result_json  TEXT,                      -- full report.to_dict() output from the tool
  error        TEXT,                      -- populated if status = 'failed'
  run_by       TEXT,                      -- admin email who triggered it
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tool_runs_created_at ON tool_runs(created_at DESC);
