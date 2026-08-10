// middleware/shieldMiddleware.js
// Drop this into your Express app EARLY in the middleware chain —
// before your routes, ideally right after body parsing, so it can
// inspect req.body/query/params before any handler runs.
//
// Usage in your main app file:
//   import { shield } from './middleware/shieldMiddleware.js';
//   app.use(shield);

import { isBlocked, blockIp } from '../shield/blocklist.js';
import { scanRequest } from '../shield/detector.js';
import { recordRequest } from '../shield/bruteForceGuard.js';
import { logSecurityEvent } from '../shield/eventLogger.js';

function getClientIp(req) {
  // Trust proxy must be enabled on the Express app (app.set('trust proxy', 1))
  // for req.ip to reflect the real client IP behind Railway's proxy.
  return req.ip || req.connection?.remoteAddress || 'unknown';
}

export async function shield(req, res, next) {
  const ip = getClientIp(req);

  try {
    // 1. Already blocked? Reject immediately, skip further checks.
    if (await isBlocked(ip)) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    // 2. Track request volume for brute-force / rate abuse detection.
    const gotBlockedForRate = await recordRequest(ip);
    if (gotBlockedForRate) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    // 3. Scan this request's content for known attack signatures.
    const detection = scanRequest(req);
    if (detection) {
      await logSecurityEvent({
        ip,
        eventType: detection.eventType,
        severity: detection.severity,
        path: req.originalUrl,
        method: req.method,
        matchedPattern: detection.matchedPattern,
        snippet: detection.snippet,
        blocked: true,
      });
      await blockIp(ip, `${detection.eventType}: ${detection.matchedPattern}`, detection.severity);
      return res.status(403).json({ error: 'Request blocked.' });
    }

    next();
  } catch (err) {
    // Fail open: if Shield itself errors, don't take down the whole API.
    // Log to your existing error handler/console so it's visible.
    console.error('[shield] error, allowing request through:', err.message);
    next();
  }
}
