import { Router } from 'express';
import db from '../db.js';
import {
  stats,
  getUptimeSeconds,
  getAverageLatencyMs,
  getRequestsPerSecond,
  getAutoResponseRate,
} from '../stats.js';

const router = Router();

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${Math.floor(seconds % 60)}s`;
}

// Public, read-only: real metrics derived from this server's own request traffic
// and database, used to drive the AI Defense Matrix section on the landing page.
router.get('/defense-matrix', (req, res) => {
  const uptimeSeconds = getUptimeSeconds();
  const avgLatency = getAverageLatencyMs();
  const reqPerSec = getRequestsPerSecond();
  const autoResponseRate = getAutoResponseRate();

  const totalSubmissions = db.prepare('SELECT COUNT(*) AS c FROM submissions').get().c;

  res.json({
    generatedAt: new Date().toISOString(),
    serverUptime: formatUptime(uptimeSeconds),
    layers: [
      {
        id: 'perception',
        metricLabel: 'Requests handled',
        metricValue: stats.requestCount.toLocaleString(),
        detail: `${reqPerSec.toFixed(2)} req/sec live`,
        status: 'active',
      },
      {
        id: 'cognition',
        metricLabel: 'Contact submissions analyzed',
        metricValue: totalSubmissions.toLocaleString(),
        detail: 'from this deployment',
        status: 'active',
      },
      {
        id: 'decision',
        metricLabel: 'Avg. API latency',
        metricValue: avgLatency === null ? '—' : `${avgLatency.toFixed(1)}ms`,
        detail: avgLatency === null ? 'no traffic yet' : `last ${stats.latencies.length} requests`,
        status: 'active',
      },
      {
        id: 'action',
        metricLabel: 'Contact form success rate',
        metricValue: autoResponseRate === null ? '—' : `${autoResponseRate.toFixed(1)}%`,
        detail: `${stats.contactSuccesses}/${stats.contactAttempts} attempts`,
        status: 'active',
      },
      {
        id: 'evolution',
        metricLabel: 'Server uptime',
        metricValue: formatUptime(uptimeSeconds),
        detail: 'since last deploy',
        status: 'active',
      },
      {
        id: 'counter-ai',
        metricLabel: 'Bot submissions blocked',
        metricValue: stats.honeypotBlocked.toLocaleString(),
        detail: 'via honeypot field',
        status: stats.honeypotBlocked > 0 ? 'active' : 'idle',
      },
    ],
  });
});

export default router;
