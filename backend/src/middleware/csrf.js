import { randomBytes } from 'crypto';
import { config } from '../config.js';

const CSRF_COOKIE = 'csrfToken';
const CSRF_HEADER = 'x-csrf-token';

export function setCsrfCookie(req, res, next) {
  let token = req.cookies?.[CSRF_COOKIE];
  if (!token) {
    token = randomBytes(32).toString('hex');
    res.cookie(CSRF_COOKIE, token, {
      httpOnly: false,        // must be readable by JS so secureFetch can send it
      secure: config.env === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000,
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

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({ error: 'Invalid or missing CSRF token' });
  }

  next();
}
