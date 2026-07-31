import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export function authenticateToken(req, res, next) {
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
    req.user = jwt.verify(finalToken, config.jwtSecret);
    next();
  } catch (err) {
    if (isBrowser) return res.redirect('/admin/login.html');
    return res.status(403).json({ error: 'Invalid or expired token.' });
  }
}

export function requireAdmin(req, res, next) {
  authenticateToken(req, res, () => {
    // In this single-tenant app, any valid token holder is treated as admin.
    // If you add multi-role support later, check req.user.role === 'admin' here.
    next();
  });
}
