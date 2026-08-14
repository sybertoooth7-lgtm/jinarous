// backend/src/middleware/adaptiveRateLimit.js
// Rate limits that tighten when abuse is detected.
// Requires Redis for multi-instance deployments.

import rateLimit from 'express-rate-limit';
import Redis from 'ioredis';

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  db: Number(process.env.REDIS_DB) || 0,
});

const VIOLATION_KEY_PREFIX = 'ratelimit:violations:';
const VIOLATION_TTL_SECONDS = 15 * 60; // 15 minutes

/**
 * Records a violation for an IP, increasing its penalty score.
 * Called automatically when rate limit is exceeded.
 */
export async function recordViolation(ip) {
  const key = `${VIOLATION_KEY_PREFIX}${ip}`;
  try {
    await redis.incr(key);
    await redis.expire(key, VIOLATION_TTL_SECONDS);
  } catch (err) {
    console.error('[adaptiveRateLimit] Redis violation record failed:', err.message);
  }
}

/**
 * Gets the current violation score for an IP.
 */
async function getViolationScore(ip) {
  const key = `${VIOLATION_KEY_PREFIX}${ip}`;
  try {
    const score = await redis.get(key);
    return parseInt(score || '0', 10);
  } catch {
    return 0;
  }
}

/**
 * Computes adaptive max requests based on violation history.
 * Each violation halves the budget, with a floor of 5 req/15min.
 */
async function getAdaptiveMax(ip, baseMax) {
  const score = await getViolationScore(ip);
  if (score === 0) return baseMax;
  const multiplier = Math.max(1 / Math.pow(2, score), 5 / baseMax);
  return Math.floor(baseMax * multiplier);
}

// Redis-backed store for express-rate-limit
class RedisRateLimitStore {
  constructor() {
    this.prefix = 'ratelimit:store:';
  }

  async increment(key) {
    const fullKey = `${this.prefix}${key}`;
    const current = await redis.incr(fullKey);
    await redis.expire(fullKey, 15 * 60); // 15 min window
    return { totalHits: current, resetTime: new Date(Date.now() + 15 * 60 * 1000) };
  }

  async decrement(key) {
    const fullKey = `${this.prefix}${key}`;
    await redis.decr(fullKey);
  }

  async resetKey(key) {
    const fullKey = `${this.prefix}${key}`;
    await redis.del(fullKey);
  }
}

// General API — adaptive, starts at 100 req/15min
export const adaptiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: async (req) => getAdaptiveMax(req.ip, 100),
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisRateLimitStore(),
  keyGenerator: (req) => `api:${req.ip}`,
  handler: async (req, res, next, options) => {
    await recordViolation(req.ip);
    res.status(429).json({
      error: 'Too many requests. Rate limit reduced due to recent activity.',
      retryAfter: 15 * 60,
    });
  },
});

// Auth endpoints — strict, non-adaptive (always 5 req/15min)
export const strictAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisRateLimitStore(),
  keyGenerator: (req) => `auth:${req.ip}`,
  handler: async (req, res, next, options) => {
    await recordViolation(req.ip);
    res.status(429).json({
      error: 'Too many login attempts. Account temporarily restricted.',
      retryAfter: 15 * 60,
    });
  },
});

// Contact form — adaptive, starts at 5 req/window
export const adaptiveContactLimiter = rateLimit({
  windowMs: (Number(process.env.CONTACT_RATE_LIMIT_WINDOW_MINUTES) || 15) * 60 * 1000,
  max: async (req) =>
    getAdaptiveMax(req.ip, Number(process.env.CONTACT_RATE_LIMIT_MAX) || 5),
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisRateLimitStore(),
  keyGenerator: (req) => `contact:${req.ip}`,
  handler: async (req, res, next, options) => {
    await recordViolation(req.ip);
    res.status(429).json({ error: 'Too many submissions. Please try again later.' });
  },
});
