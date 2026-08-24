// backend/src/middleware/helmetConfig.js
import helmet from 'helmet';
import { config } from '../config.js';

export function attachCspNonce(req, res, next) {
  res.locals.cspNonce = Buffer.from(crypto.randomUUID()).toString('base64');
  next();
}

export const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", (req, res) => `'nonce-${res.locals.cspNonce}'`],
      styleSrc: ["'self'", "'unsafe-inline'", (req, res) => `'nonce-${res.locals.cspNonce}'`],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
});
