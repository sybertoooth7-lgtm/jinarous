-- 003_add_tool_runs.sql already created the tool_runs table. A later
-- migration (008_add_tool_runs.sql, now removed) tried to widen
-- summary_json/result_json to JSONB and add a run_by column, but used
-- CREATE TABLE IF NOT EXISTS — which is a no-op once the table already
-- exists, so those improvements never actually applied. This does it
-- correctly with ALTER TABLE.
ALTER TABLE tool_runs ALTER COLUMN summary_json TYPE JSONB USING summary_json::jsonb;
ALTER TABLE tool_runs ALTER COLUMN result_json TYPE JSONB USING result_json::jsonb;
ALTER TABLE tool_runs ADD COLUMN IF NOT EXISTS run_by TEXT;
