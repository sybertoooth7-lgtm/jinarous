import { Router } from 'express';
import {
  getUptimeSeconds,
  getAverageLatencyMs,
  getRequestsPerSecond,
  getPersistedTotals,
} from '../stats.js';

const router = Router();

// Intentionally public/unauthenticated: this powers the "live system status"
// section on the public marketing site, viewed by anonymous visitors who
// have no admin token. None of these fields are sensitive — aggregate
// request/error counts, latency, and uptime, nothing user-identifying.
router.get('/defense-matrix', async (req, res) => {
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
