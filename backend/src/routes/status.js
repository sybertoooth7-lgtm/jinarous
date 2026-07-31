import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import {
  stats,
  getUptimeSeconds,
  getAverageLatencyMs,
  getRequestsPerSecond,
  getAutoResponseRate,
} from '../stats.js';

const router = Router();

router.get('/defense-matrix', authenticateToken, (req, res) => {
  res.json({
    requestCount: stats.requestCount,
    errorCount: stats.errorCount,
    averageLatencyMs: getAverageLatencyMs(),
    requestsPerSecond: getRequestsPerSecond(),
    uptimeSeconds: getUptimeSeconds(),
    contactSuccessRate: getAutoResponseRate(),
    honeypotBlocked: stats.honeypotBlocked,
  });
});

export default router;
