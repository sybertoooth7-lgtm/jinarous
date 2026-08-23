// backend/src/middleware/auth.js
// Updated to include role in the JWT payload and attach role from DB.

import jwt from 'jsonwebtoken';
import db from '../db.js';
import { config } from '../config.js';

export async function blocklistToken(jti, expiresAt) {
  if (!jti) return;
  try {
    await db.query(
      `INSERT INTO token_blocklist (jti, expires_at) VALUES ($1, $2)
       ON CONFLICT (jti) DO NOTHING`,
      [jti, expiresAt]
    );
  } catch (err) {
    console.error('[auth] Failed to blocklist token:', err.message);
  }
}

async function isBlocklisted(jti) {
  if (!jti) return false;
  try {
    const result = await db.query('SELECT 1 FROM token_blocklist WHERE jti = $1', [jti]);
    return result.rows.length > 0;
  } catch (err) {
    console.error('[auth] Blocklist check failed:', err.message);
    return false;
  }
}

export async function requireAuth(req, res, next) {
  const token = req.cookies?.adminToken || req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, config.jwtSecret);
  } catch {
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
  }

  if (decoded.role === 'client') {
    return res.status(401).json({ error: 'Unauthorized: Wrong token type' });
  }

  if (decoded.jti && await isBlocklisted(decoded.jti)) {
    return res.status(401).json({ error: 'Unauthorized: Token has been revoked' });
  }

  // Attach role from DB (token may be stale if role was changed)
  try {
    const { rows } = await db.query(
      'SELECT role FROM admin_users WHERE id = $1',
      [decoded.sub]
    );
    if (rows.length > 0) {
      decoded.role = rows[0].role;
    }
  } catch (err) {
    console.error('[auth] Failed to fetch user role:', err.message);
  }

  req.token = token;
  req.user = decoded;
  next();
}
