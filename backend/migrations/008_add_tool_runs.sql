CREATE TABLE IF NOT EXISTS tool_runs (
  id SERIAL PRIMARY KEY,
  tool TEXT NOT NULL,
  target TEXT NOT NULL,
  status TEXT NOT NULL,
  summary_json JSONB,
  result_json JSONB,
  error TEXT,
  run_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
