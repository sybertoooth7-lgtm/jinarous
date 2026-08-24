// backend/src/routes/status.js
import { Router } from 'express';
import { stats } from '../stats.js';

const router = Router();

function getUptimeSeconds() {
  return Math.floor((Date.now() - stats.serverStartTime) / 1000);
}

function getRequestsPerSecond() {
  const elapsed = (Date.now() - stats.serverStartTime) / 1000;
  return elapsed > 0 ? (stats.requestCount / elapsed).toFixed(2) : 0;
}

function getAverageLatencyMs() {
  if (stats.latencies.length === 0) return 0;
  const sum = stats.latencies.reduce((a, b) => a + b, 0);
  return (sum / stats.latencies.length).toFixed(2);
}

function getAutoResponseRate() {
  if (stats.requestCount === 0) return 0;
  return ((stats.autoResponses / stats.requestCount) * 100).toFixed(2);
}

router.get('/', (req, res) => {
  res.json({
    status: 'ok',
    uptime: getUptimeSeconds(),
    requestsPerSecond: getRequestsPerSecond(),
    averageLatencyMs: getAverageLatencyMs(),
    totalRequests: stats.requestCount,
    totalErrors: stats.errorCount,
    autoResponseRate: getAutoResponseRate(),
    honeypotBlocked: stats.honeypotBlocked,
    serverStartTime: stats.serverStartTime,
  });
});

export default router;
