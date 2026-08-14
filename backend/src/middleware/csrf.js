// backend/src/middleware/csrf.js
// Double-submit cookie CSRF protection.
// Safe methods (GET/HEAD/OPTIONS) receive the token cookie.
// State-changing methods must echo it back in the x-csrf-token header.
import { randomBytes, timingSafeEqual } from 'crypto';

const CSRF_COOKIE = 'csrfToken';
const CSRF_HEADER = 'x-csrf-token';

function generateToken() {
  return randomBytes(32).toString('base64url');
}

export function setCsrfCookie(req, res, next) {
  let token = req.cookies?.[CSRF_COOKIE];
  if (!token || token.length < 32) {
    token = generateToken();
    res.cookie(CSRF_COOKIE, token, {
      httpOnly: false,        // must be readable by frontend JS
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000,
      path: '/',
    });
  }
  req.csrfToken = token;
  next();
}

export function verifyCsrfToken(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.headers[CSRF_HEADER];

  if (!cookieToken || !headerToken) {
    return res.status(403).json({ error: 'CSRF token missing' });
  }

  try {
    const cookieBuf = Buffer.from(cookieToken);
    const headerBuf = Buffer.from(headerToken);
    if (cookieBuf.length !== headerBuf.length || !timingSafeEqual(cookieBuf, headerBuf)) {
      return res.status(403).json({ error: 'Invalid CSRF token' });
    }
  } catch {
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }

  next();
}
