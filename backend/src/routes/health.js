// backend/src/routes/health.js
// Cached deep health check to prevent DB connection exhaustion.

import { Router } from 'express';
import db from '../db.js';

const router = Router();

let cachedHealth = { status: 'ok', database: 'connected' };
let cachedAt = 0;
const CACHE_TTL_MS = 5000;

router.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

router.get('/health/deep', async (req, res) => {
  const now = Date.now();
  if (now - cachedAt < CACHE_TTL_MS) {
    return res.json(cachedHealth);
  }

  try {
    await db.query('SELECT 1');
    cachedHealth = { status: 'ok', database: 'connected' };
    res.json(cachedHealth);
  } catch (err) {
    cachedHealth = { status: 'error', database: 'unreachable' };
    res.status(503).json(cachedHealth);
  } finally {
    cachedAt = now;
  }
});

export default router;
