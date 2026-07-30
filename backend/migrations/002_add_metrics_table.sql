-- Adds the `metrics` table used to persist cumulative Defense Matrix
-- counters (request count, honeypot catches, etc.) across restarts/
-- redeploys. Previously these lived only in memory (stats.js) and
-- silently reset to zero on every deploy.

CREATE TABLE IF NOT EXISTS metrics (
  key   TEXT PRIMARY KEY,
  value INTEGER NOT NULL DEFAULT 0
);
