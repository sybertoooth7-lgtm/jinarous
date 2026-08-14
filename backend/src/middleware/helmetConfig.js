// backend/src/middleware/helmetConfig.js
// Strict Helmet + CSP with nonce. Import and use this in index.js.

import helmet from 'helmet';
import crypto from 'crypto';

export function generateNonce() {
  return crypto.randomBytes(16).toString('base64');
}

/**
 * Attach this BEFORE helmet() to generate a nonce per request.
 */
export function attachCspNonce(req, res, next) {
  res.locals.cspNonce = generateNonce();
  next();
}

export const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        (req, res) => `'nonce-${res.locals.cspNonce}'`,
      ],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: [],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  crossOriginEmbedderPolicy: false,
});
