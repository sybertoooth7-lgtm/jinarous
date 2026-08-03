import db from './db.js';

const MAX_LATENCY_SAMPLES = 200;
const PERSISTED_KEYS = ['requestCount', 'errorCount', 'contactAttempts', 'contactSuccesses', 'honeypotBlocked'];
const FLUSH_INTERVAL_MS = 10000;

async function loadPersistedValue(key) {
  try {
    const result = await db.query('SELECT value FROM metrics WHERE key = $1', [key]);
    return result.rows[0] ? parseInt(result.rows[0].value, 10) : 0;
  } catch (err) {
    console.error(`[stats] Failed to load ${key}, defaulting to 0:`, err.message);
    return 0;
  }
}

const requestCount = await loadPersistedValue('requestCount');
const errorCount = await loadPersistedValue('errorCount');
const contactAttempts = await loadPersistedValue('contactAttempts');
const contactSuccesses = await loadPersistedValue('contactSuccesses');
const honeypotBlocked = await loadPersistedValue('honeypotBlocked');

export const stats = {
  serverStartTime: Date.now(),
  requestCount,
  errorCount,
  latencies: [],
  contactAttempts,
  contactSuccesses,
  honeypotBlocked,
  instanceRequestCount: 0,
  instanceErrorCount: 0,
};

let dirty = false;

// Tracks how much each counter has grown *since the last successful flush*,
// per worker process. Under CLUSTER_MODE, every worker has its own copy of
// `stats` — persisting the absolute value on each flush meant whichever
// worker's timer fired last would silently overwrite the others' counts.
// Persisting the delta instead means every worker's contribution adds up
// correctly in the database, regardless of how many workers are running.
const pendingDelta = Object.fromEntries(PERSISTED_KEYS.map(k => [k, 0]));

export async function persistStats() {
  if (!dirty) return;
  const deltas = { ...pendingDelta };
  await db.transaction(async (client) => {
    for (const key of PERSISTED_KEYS) {
      if (!deltas[key]) continue;
      await client.query(`
        INSERT INTO metrics (key, value) VALUES ($1, $2)
        ON CONFLICT (key) DO UPDATE SET value = metrics.value + EXCLUDED.value
      `, [key, deltas[key]]);
    }
  });
  for (const key of PERSISTED_KEYS) pendingDelta[key] -= deltas[key];
  dirty = false;
}

// Cross-worker cumulative totals, read straight from the database. Any one
// worker's in-memory `stats` object only reflects the traffic it personally
// handled, so the live dashboard should use this — not `stats` directly —
// for counters that are supposed to represent the whole cluster.
export async function getPersistedTotals() {
  const result = await db.query(
    `SELECT key, value FROM metrics WHERE key = ANY($1)`,
    [PERSISTED_KEYS]
  );
  const totals = Object.fromEntries(PERSISTED_KEYS.map(k => [k, 0]));
  for (const row of result.rows) {
    totals[row.key] = parseInt(row.value, 10);
  }
  return totals;
}

setInterval(() => persistStats().catch(console.error), FLUSH_INTERVAL_MS);
process.on('SIGTERM', () => persistStats().catch(console.error));
process.on('SIGINT', () => persistStats().catch(console.error));

export function recordRequest(latencyMs, isError) {
  stats.requestCount += 1;
  stats.instanceRequestCount += 1;
  pendingDelta.requestCount += 1;
  if (isError) {
    stats.errorCount += 1;
    stats.instanceErrorCount += 1;
    pendingDelta.errorCount += 1;
  }
  stats.latencies.push(latencyMs);
  if (stats.latencies.length > MAX_LATENCY_SAMPLES) stats.latencies.shift();
  dirty = true;
}

export function recordContactAttempt() {
  stats.contactAttempts += 1;
  pendingDelta.contactAttempts += 1;
  dirty = true;
}

export function recordContactSuccess() {
  stats.contactSuccesses += 1;
  pendingDelta.contactSuccesses += 1;
  dirty = true;
}

export function recordHoneypotBlocked() {
  stats.honeypotBlocked += 1;
  pendingDelta.honeypotBlocked += 1;
  dirty = true;
}

export function getUptimeSeconds() {
  return (Date.now() - stats.serverStartTime) / 1000;
}

export function getAverageLatencyMs() {
  if (stats.latencies.length === 0) return null;
  return stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length;
}

export function getRequestsPerSecond() {
  const uptime = getUptimeSeconds();
  if (uptime <= 0) return 0;
  return stats.instanceRequestCount / uptime;
}

export function getAutoResponseRate() {
  if (stats.contactAttempts === 0) return null;
  return (stats.contactSuccesses / stats.contactAttempts) * 100;
}
