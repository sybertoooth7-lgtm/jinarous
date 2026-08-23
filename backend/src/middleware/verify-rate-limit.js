// backend/src/middleware/verify-rate-limit.js
// Dedicated stricter rate limiter for the unauthenticated /api/verify endpoint.

import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { PostgresRateLimitStore } from '../lib/rate-limit-store.js';

export const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  store: new PostgresRateLimitStore(),
  keyGenerator: (req) => `verify:${ipKeyGenerator(req.ip)}`,
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many verification attempts, please try again later.',
      retryAfter: 15 * 60,
    });
  },
});
