// backend/src/routes/health.js
// Cached health check — prevents DB DoS from aggressive polling
// while still surfacing actual outages within ~5 seconds.

import { Router } from 'express';
import { pool } from '../db.js'; // adjust import path to your db module

const router = Router();

// In-memory cache: { healthy: boolean, expiresAt: number }
let cache = { healthy: true, expiresAt: 0 };
const CACHE_TTL_MS = 5000;

async function checkDb() {
  const now = Date.now();
  if (now < cache.expiresAt) {
    return cache.healthy;
  }
  try {
    await pool.query('SELECT 1');
    cache = { healthy: true, expiresAt: now + CACHE_TTL_MS };
    return true;
  } catch (err) {
    cache = { healthy: false, expiresAt: now + CACHE_TTL_MS };
    return false;
  }
}

router.get('/', async (_req, res) => {
  const dbHealthy = await checkDb();
  if (!dbHealthy) {
    return res.status(503).json({
      status: 'unhealthy',
      db: 'down',
      timestamp: new Date().toISOString(),
    });
  }
  res.json({
    status: 'healthy',
    db: 'up',
    timestamp: new Date().toISOString(),
  });
});

export default router;
