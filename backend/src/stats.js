// Tracks real, in-process server metrics used to power the public "AI Defense Matrix"
// status endpoint. Nothing here is simulated business logic - it's genuine counters
// derived from actual request traffic on this server.

const MAX_LATENCY_SAMPLES = 200;

export const stats = {
  serverStartTime: Date.now(),
  requestCount: 0,
  errorCount: 0,
  latencies: [], // rolling window, milliseconds
  contactAttempts: 0,
  contactSuccesses: 0,
  honeypotBlocked: 0,
};

export function recordRequest(latencyMs, isError) {
  stats.requestCount += 1;
  if (isError) stats.errorCount += 1;
  stats.latencies.push(latencyMs);
  if (stats.latencies.length > MAX_LATENCY_SAMPLES) {
    stats.latencies.shift();
  }
}

export function recordContactAttempt() {
  stats.contactAttempts += 1;
}

export function recordContactSuccess() {
  stats.contactSuccesses += 1;
}

export function recordHoneypotBlocked() {
  stats.honeypotBlocked += 1;
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
