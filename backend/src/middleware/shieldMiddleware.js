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

// detector.js scans the ENTIRE request body/query as one blob (see
// extractScannableContent in detector.js) — it can't tell "SELECT * FROM"
// apart from someone typing "we need to select a union representative"
// in a free-text field. A single match blocks that visitor's IP for
// 6+ hours (see blockIp severity durations in shield/blocklist.js).
//
// Paths listed here skip signature scanning (step 3 below) but still go
// through isBlocked() and recordRequest() — so volume-based abuse and
// already-blocked IPs are still caught, just not single-word false
// positives on legitimate free text. Only add paths here that (a) accept
// free-text user input and (b) use parameterized queries downstream, so
// there's no injection risk being traded away.
//
// NOTE: Every path in this list MUST end with a trailing slash check
// or use .startsWith() so variations like /api/contact/123 don't leak
// through un-scanned.
const SIGNATURE_SCAN_EXEMPT_PATHS = [
  '/api/contact',               // public contact form (message field)
  '/api/admin/submissions',     // admin search queries (search param)
  '/api/admin/clients',         // compliance notes (notes field on PATCH .../compliance/:itemId)
];

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

    // 3. Scan this request's content for known attack signatures —
    //    skipped for free-text endpoints listed above.
    //    We check startsWith so /api/contact, /api/contact/, and
    //    /api/contact/123 all get the same exemption.
    const isExempt = SIGNATURE_SCAN_EXEMPT_PATHS.some((p) =>
      req.path === p || req.path.startsWith(p + '/')
    );
    const detection = isExempt ? null : scanRequest(req);
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
