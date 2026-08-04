import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import db from '../db.js';

export async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  const cookieToken = req.cookies?.admin_token;
  const finalToken = token || cookieToken;
  const isBrowser = req.headers.accept?.includes('text/html');

  if (!finalToken) {
    if (isBrowser) return res.redirect('/admin/login.html');
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(finalToken, config.jwtSecret);

    if (decoded.jti) {
      const blockResult = await db.query(
        'SELECT 1 FROM token_blocklist WHERE jti = $1',
        [decoded.jti]
      );
      if (blockResult.rows.length > 0) {
        throw new Error('Token revoked');
      }
    }

    req.user = decoded;
    next();
  } catch (err) {
    if (isBrowser) return res.redirect('/admin/login.html');
    return res.status(403).json({ error: 'Invalid or expired token.' });
  }
}

export function requireAdmin(req, res, next) {
  authenticateToken(req, res, () => {
    next();
  });
}
