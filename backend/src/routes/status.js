import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import {
  getUptimeSeconds,
  getAverageLatencyMs,
  getRequestsPerSecond,
  getPersistedTotals,
} from '../stats.js';

const router = Router();

router.get('/defense-matrix', authenticateToken, async (req, res) => {
  // Cumulative counters come from the database so the number reflects the
  // whole cluster's traffic, not just whichever worker happened to handle
  // this request. Latency/throughput stay per-instance since they describe
  // this process's current load, not a historical total.
  const totals = await getPersistedTotals();
  const contactSuccessRate = totals.contactAttempts > 0
    ? (totals.contactSuccesses / totals.contactAttempts) * 100
    : null;

  res.json({
    requestCount: totals.requestCount,
    errorCount: totals.errorCount,
    averageLatencyMs: getAverageLatencyMs(),
    requestsPerSecond: getRequestsPerSecond(),
    uptimeSeconds: getUptimeSeconds(),
    contactSuccessRate,
    honeypotBlocked: totals.honeypotBlocked,
  });
});

export default router;
