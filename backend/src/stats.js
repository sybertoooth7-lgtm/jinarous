// Tracks real, in-process server metrics used to power the public "AI Defense Matrix"
// status endpoint. Nothing here is simulated business logic - it's genuine counters
// derived from actual request traffic on this server.
//
// Cumulative counters (requestCount, errorCount, contactAttempts,
// contactSuccesses, honeypotBlocked) are persisted to the `metrics` table in
// SQLite so they survive a restart/redeploy - previously these lived only in
// memory and silently reset to zero on every deploy, which undermined the
// credibility of a dashboard whose whole pitch is "these are real numbers."
//
// Rolling/instantaneous values (the latency sample window, and uptime-since-
// last-restart) are intentionally NOT persisted - they describe the current
// process's live state, and resetting them on restart is correct behavior,
// not a bug.

import db from './db.js';

const MAX_LATENCY_SAMPLES = 200;
const PERSISTED_KEYS = ['requestCount', 'errorCount', 'contactAttempts', 'contactSuccesses', 'honeypotBlocked'];
const FLUSH_INTERVAL_MS = 10_000;

function loadPersistedValue(key) {
  const row = db.prepare('SELECT value FROM metrics WHERE key = ?').get(key);
  return row ? row.value : 0;
}

const upsertStmt = db.prepare(`
  INSERT INTO metrics (key, value) VALUES (@key, @value)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value
`);

export const stats = {
  serverStartTime: Date.now(),
  requestCount: loadPersistedValue('requestCount'),
  errorCount: loadPersistedValue('errorCount'),
  latencies: [], // rolling window, milliseconds - intentionally not persisted
  contactAttempts: loadPersistedValue('contactAttempts'),
  contactSuccesses: loadPersistedValue('contactSuccesses'),
  honeypotBlocked: loadPersistedValue('honeypotBlocked'),
};

let dirty = false;

export function persistStats() {
  if (!dirty) return;
  const tx = db.transaction(() => {
    for (const key of PERSISTED_KEYS) {
      upsertStmt.run({ key, value: stats[key] });
    }
  });
  tx();
  dirty = false;
}

// Flush periodically rather than on every single request, so a busy site
// doesn't turn every request into an extra disk write.
const flushInterval = setInterval(persistStats, FLUSH_INTERVAL_MS);
flushInterval.unref(); // don't keep the process alive just for this timer

// Flush on graceful shutdown so the last few requests before a redeploy
// aren't lost. Railway/Render/etc. send SIGTERM before killing the process.
process.on('SIGTERM', persistStats);
process.on('SIGINT', persistStats);

export function recordRequest(latencyMs, isError) {
  stats.requestCount += 1;
  if (isError) stats.errorCount += 1;
  stats.latencies.push(latencyMs);
  if (stats.latencies.length > MAX_LATENCY_SAMPLES) {
    stats.latencies.shift();
  }
  dirty = true;
}

export function recordContactAttempt() {
  stats.contactAttempts += 1;
  dirty = true;
}

export function recordContactSuccess() {
  stats.contactSuccesses += 1;
  dirty = true;
}

export function recordHoneypotBlocked() {
  stats.honeypotBlocked += 1;
  dirty = true;
}

export function getUptimeSeconds() {
  return (Date.now() - stats.serverStartTime) / 1000;
}

export function getAverageLatencyMs() {
  if (stats.latencies.length === 0) return null;
  const sum = stats.latencies.reduce((a, b) => a + b, 0);
  return sum / stats.latencies.length;
}

export function getRequestsPerSecond() {
  const uptime = getUptimeSeconds();
  if (uptime <= 0) return 0;
  return stats.requestCount / uptime;
}

export function getAutoResponseRate() {
  if (stats.contactAttempts === 0) return null;
  return (stats.contactSuccesses / stats.contactAttempts) * 100;
}
