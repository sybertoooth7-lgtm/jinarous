// middleware/shieldMiddleware.js
// Drop this into your Express app EARLY in the middleware chain —
// before your routes, ideally right after body parsing, so it can
// inspect req.body/query/params before any handler runs.

import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { isBlocked, blockIp } from '../shield/blocklist.js';
import { scanRequest } from '../shield/detector.js';
import { recordRequest } from '../shield/bruteForceGuard.js';
import { logSecurityEvent } from '../shield/eventLogger.js';

// detector.js scans the ENTIRE request body/query as one blob — it can't
// tell "SELECT * FROM" apart from someone typing "we need to select a
// union representative" in a free-text field. A single match blocks that
// visitor's IP for 6+ hours.
//
// Paths listed here skip signature scanning (step 3 below) but still go
// through isBlocked() and recordRequest() — so volume-based abuse and
// already-blocked IPs are still caught.
//
// NOTE: Every path in this list MUST end with a trailing slash check
// or use .startsWith() so sub-paths are also exempt.
const SIGNATURE_SCAN_EXEMPT_PATHS = [
  '/api/contact',               // public contact form (message field)
  '/api/admin/submissions',     // admin search queries (search param)
  '/api/admin/clients',         // compliance notes (notes field on PATCH .../compliance/:itemId)
];

function getClientIp(req) {
  return req.ip || req.connection?.remoteAddress || 'unknown';
}

// Lightweight check only — verifies the JWT signature and expiry, nothing
// more. It deliberately does NOT check the token blocklist or re-fetch the
// user's role from the DB (that's real auth's job, enforced downstream by
// requireAuth/requireClientAuth on every protected route). This function
// only decides whether the *volume* counter below applies to this request;
// it grants no access by itself. A stolen-but-revoked token still passes
// this check and skips the volume counter, but gets 401'd the moment it
// hits any actual protected route — so nothing here is a real bypass.
function hasValidSessionToken(req) {
  const token = req.cookies?.adminToken || req.cookies?.clientToken;
  if (!token) return false;
  try {
    jwt.verify(token, config.jwtSecret);
    return true;
  } catch {
    return false;
  }
}

export async function shield(req, res, next) {
  const ip = getClientIp(req);

  try {
    // 1. Already blocked? Reject immediately.
    if (await isBlocked(ip)) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    // 2. Track request volume for brute-force / rate abuse detection —
    // skipped for requests carrying a validly signed session cookie.
    // Authenticated traffic is already covered by the per-route
    // express-rate-limit limiter and by requireAuth/requireClientAuth
    // enforcing real revocation; this counter exists to catch anonymous
    // flooding/brute-force, not normal logged-in dashboard usage (a single
    // client dashboard page load alone fires several parallel requests).
    if (!hasValidSessionToken(req)) {
      const gotBlockedForRate = await recordRequest(ip);
      if (gotBlockedForRate) {
        return res.status(403).json({ error: 'Access denied.' });
      }
    }

    // 3. Scan for attack signatures — skipped for free-text endpoints.
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
    console.error('[shield] error, allowing request through:', err.message);
    next();
  }
}
