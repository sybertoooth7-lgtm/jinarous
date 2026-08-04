const rateLimit = require('express-rate-limit');

/**
 * Fix #5: Cluster-aware rate limiting using Redis store.
 * Install dependencies: npm install rate-limit-redis ioredis
 * 
 * Falls back to memory store if Redis is unavailable (logs warning).
 */

let RedisStore;
try {
  RedisStore = require('rate-limit-redis');
} catch {
  console.warn('[rate-limit] rate-limit-redis not installed. Using memory store (not cluster-safe).');
}

let Redis;
try {
  Redis = require('ioredis');
} catch {
  console.warn('[rate-limit] ioredis not installed. Using memory store (not cluster-safe).');
}

function createLimiter() {
  const windowMs = 15 * 60 * 1000; // 15 minutes
  const max = 100; // requests per window per IP

  const baseConfig = {
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.ip,
    handler: (req, res) => {
      res.status(429).json({ 
        error: 'Too many requests, please try again later.',
        retryAfter: Math.ceil(windowMs / 1000)
      });
    }
  };

  // Use Redis store if available and REDIS_URL is set
  if (RedisStore && Redis && process.env.REDIS_URL) {
    try {
      const redisClient = new Redis(process.env.REDIS_URL, {
        retryStrategy: (times) => Math.min(times * 50, 2000),
        maxRetriesPerRequest: 3
      });

      redisClient.on('error', (err) => {
        console.error('[rate-limit] Redis error:', err.message);
      });

      return rateLimit({
        ...baseConfig,
        store: new RedisStore({
          sendCommand: (...args) => redisClient.call(...args),
        })
      });
    } catch (err) {
      console.warn('[rate-limit] Failed to create Redis store, falling back to memory:', err.message);
    }
  }

  // Fallback: memory store (works for single-instance, not cluster-safe)
  return rateLimit(baseConfig);
}

const limiter = createLimiter();

module.exports = { limiter, createLimiter };
