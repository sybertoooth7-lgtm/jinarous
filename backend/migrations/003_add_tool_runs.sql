-- Stores the results of security tools run from the admin dashboard (e.g.
-- "Run Access Control Audit" against a lead's URL), so results are a real,
-- persisted report a client engagement can be built on.

CREATE TABLE IF NOT EXISTS tool_runs (
  id SERIAL PRIMARY KEY,
  tool TEXT NOT NULL,
  target TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','failed')),
  summary_json TEXT,
  result_json TEXT,
  error TEXT,
  run_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tool_runs_created_at ON tool_runs(created_at DESC);
