// backend/src/middleware/csrf.js
// Double-submit cookie pattern for CSRF protection.
// The server sets a random csrf-token cookie; the client reads it via JS
// and sends the same value back in X-CSRF-Token header.
// Attacker domains cannot read your cookies, so they cannot forge the header.

import crypto from 'crypto';
import { config } from '../config.js';

const CSRF_COOKIE_NAME = 'csrfToken';
const CSRF_HEADER_NAME = 'x-csrf-token';

/**
 * Sets a CSRF token cookie if one doesn't exist.
 * MUST be called after cookie-parser.
 * The cookie is NOT httpOnly so JS can read it.
 */
export function setCsrfCookie(req, res, next) {
  if (!req.cookies?.[CSRF_COOKIE_NAME]) {
    const token = crypto.randomBytes(32).toString('hex');
    res.cookie(CSRF_COOKIE_NAME, token, {
      httpOnly: false,        // readable by JS
      secure: config.isProduction,
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000, // 24h
      path: '/',
    });
    req.csrfToken = token;
  } else {
    req.csrfToken = req.cookies[CSRF_COOKIE_NAME];
  }
  next();
}

/**
 * Verifies the CSRF token for state-changing requests.
 * Safe methods (GET/HEAD/OPTIONS) are exempt.
 */
export function verifyCsrfToken(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
  const headerToken = req.headers[CSRF_HEADER_NAME];

  if (!cookieToken || !headerToken) {
    return res.status(403).json({ error: 'CSRF token missing.' });
  }

  try {
    if (!crypto.timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken))) {
      return res.status(403).json({ error: 'CSRF token mismatch.' });
    }
  } catch {
    // Buffer length mismatch
    return res.status(403).json({ error: 'CSRF token mismatch.' });
  }

  next();
}
