import { rateLimit } from 'express-rate-limit';
import db from '../db.js';

const VIOLATION_TABLE = 'rate_limit_violations';
let initialized = false;

async function ensureTables() {
  if (initialized) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS ${VIOLATION_TABLE} (
      ip INET PRIMARY KEY,
      score INTEGER NOT NULL DEFAULT 1,
      last_violation TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  initialized = true;
}

export async function recordViolation(ip) {
  await ensureTables();
  try {
    await db.query(`
      INSERT INTO ${VIOLATION_TABLE} (ip, score, last_violation)
      VALUES ($1, 1, NOW())
      ON CONFLICT (ip) DO UPDATE SET
        score = ${VIOLATION_TABLE}.score + 1,
        last_violation = NOW()
    `, [ip]);
  } catch (err) {
    console.error('[adaptiveRateLimit] Violation record failed:', err.message);
  }
}

async function getViolationScore(ip) {
  await ensureTables();
  try {
    await db.query(`
      UPDATE ${VIOLATION_TABLE}
      SET score = 1
      WHERE ip = $1 AND last_violation < NOW() - INTERVAL '1 hour'
    `, [ip]);

    const result = await db.query(
      `SELECT score FROM ${VIOLATION_TABLE} WHERE ip = $1`,
      [ip]
    );
    return result.rows[0]?.score || 0;
  } catch {
    return 0;
  }
}

async function getAdaptiveMax(ip, baseMax) {
  const score = await getViolationScore(ip);
  if (score === 0) return baseMax;
  const multiplier = Math.max(1 / Math.pow(2, score), 5 / baseMax);
  return Math.floor(baseMax * multiplier);
}

class PostgresRateLimitStore {
  constructor(windowMs = 15 * 60 * 1000) {
    this.windowMs = windowMs;
  }

  init(options) {
    this.windowMs = options.windowMs;
  }

  async increment(key) {
    const result = await db.query(
      `INSERT INTO rate_limits (key, count, reset_time)
       VALUES ($1, 1, NOW() + INTERVAL '1 millisecond' * $2)
       ON CONFLICT (key) DO UPDATE SET
         count = CASE
           WHEN rate_limits.reset_time <= NOW() THEN 1
           ELSE rate_limits.count + 1
         END,
         reset_time = CASE
           WHEN rate_limits.reset_time <= NOW() THEN NOW() + INTERVAL '1 millisecond' * $2
           ELSE rate_limits.reset_time
         END
       RETURNING count, reset_time`,
      [key, this.windowMs]
    );
    const row = result.rows[0];
    return { totalHits: row.count, resetTime: new Date(row.reset_time) };
  }

  async decrement(key) {
    await db.query(
      'UPDATE rate_limits SET count = GREATEST(count - 1, 0) WHERE key = $1',
      [key]
    );
  }

  async resetKey(key) {
    await db.query('DELETE FROM rate_limits WHERE key = $1', [key]);
  }
}

export const adaptiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: async (req) => getAdaptiveMax(req.ip, 100),
  standardHeaders: true,
  legacyHeaders: false,
  store: new PostgresRateLimitStore(),
  keyGenerator: (req) => `api:${req.ip}`,
  handler: async (req, res, next, options) => {
    await recordViolation(req.ip);
    res.status(429).json({
      error: 'Too many requests. Rate limit reduced due to recent activity.',
      retryAfter: Math.ceil(options.windowMs / 1000),
    });
  },
});

export const strictAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: async (req) => getAdaptiveMax(req.ip, 5),
  standardHeaders: true,
  legacyHeaders: false,
  store: new PostgresRateLimitStore(),
  keyGenerator: (req) => `auth:${req.ip}`,
  handler: async (req, res, next, options) => {
    await recordViolation(req.ip);
    res.status(429).json({
      error: 'Too many login attempts. Account temporarily restricted.',
      retryAfter: Math.ceil(options.windowMs / 1000),
    });
  },
});
