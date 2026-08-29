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
      // SameSite=None is required here because frontend and backend are
      // deployed on different domains (Vercel + Render) — this is a
      // genuinely cross-site relationship, not just cross-subdomain.
      // SameSite=Strict (the previous setting) silently stops the browser
      // from ever sending this cookie back to the backend, and no amount
      // of frontend fixing can work around that. SameSite=None requires
      // Secure, so `secure` is hardcoded true rather than tied to
      // NODE_ENV — this cookie is never valid to send over plain HTTP.
      secure: true,
      sameSite: 'none',
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
