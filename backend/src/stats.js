import db from './db.js';

const MAX_LATENCY_SAMPLES = 200;
const PERSISTED_KEYS = ['requestCount', 'errorCount', 'contactAttempts', 'contactSuccesses', 'honeypotBlocked'];
const FLUSH_INTERVAL_MS = 10000;

async function loadPersistedValue(key) {
  const result = await db.query('SELECT value FROM metrics WHERE key = $1', [key]);
  return result.rows[0] ? parseInt(result.rows[0].value, 10) : 0;
}

export const stats = {
  serverStartTime: Date.now(),
  requestCount: await loadPersistedValue('requestCount'),
  errorCount: await loadPersistedValue('errorCount'),
  latencies: [],
  contactAttempts: await loadPersistedValue('contactAttempts'),
  contactSuccesses: await loadPersistedValue('contactSuccesses'),
  honeypotBlocked: await loadPersistedValue('honeypotBlocked'),
  instanceRequestCount: 0, // only this process
  instanceErrorCount: 0,
};

let dirty = false;

export async function persistStats() {
  if (!dirty) return;
  await db.transaction(async (client) => {
    for (const key of PERSISTED_KEYS) {
      await client.query(`
        INSERT INTO metrics (key, value) VALUES ($1, $2)
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
      `, [key, stats[key]]);
    }
  });
  dirty = false;
}

setInterval(() => persistStats().catch(console.error), FLUSH_INTERVAL_MS);
process.on('SIGTERM', () => persistStats().catch(console.error));
process.on('SIGINT', () => persistStats().catch(console.error));

export function recordRequest(latencyMs, isError) {
  stats.requestCount += 1;
  stats.instanceRequestCount += 1;
  if (isError) {
    stats.errorCount += 1;
    stats.instanceErrorCount += 1;
  }
  stats.latencies.push(latencyMs);
  if (stats.latencies.length > MAX_LATENCY_SAMPLES) stats.latencies.shift();
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
