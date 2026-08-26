// backend/src/middleware/auth.js

import jwt from 'jsonwebtoken';
import db from '../db.js';
import { config } from '../config.js';

export async function blocklistToken(jti, expiresAt) {
  if (!jti) return;
  try {
    await db.query(
      `INSERT INTO token_blocklist (jti, expires_at) VALUES ($1, $2) ON CONFLICT (jti) DO NOTHING`,
      [jti, expiresAt]
    );
  } catch (err) {
    console.error('[auth] Failed to blocklist token:', err.message);
  }
}

export async function isBlocklisted(jti) {
  if (!jti) return false;
  try {
    // Matches the same fix already applied on the client side (clientAuth.js
    // FIX C6) — without the expiry check, an already-passed blocklist row
    // just sits there until the daily cleanup job removes it, instead of
    // being treated as stale the moment it expires.
    const result = await db.query(
      'SELECT 1 FROM token_blocklist WHERE jti = $1 AND expires_at > NOW()',
      [jti]
    );
    return result.rows.length > 0;
  } catch (err) {
    console.error('[auth] Blocklist check failed:', err.message);
    return false;
  }
}

export async function requireAuth(req, res, next) {
  const token = req.cookies?.adminToken || req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized: No token provided' });

  let decoded;
  try {
    decoded = jwt.verify(token, config.jwtSecret);
  } catch {
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
  }

  if (decoded.role === 'client') return res.status(401).json({ error: 'Unauthorized: Wrong token type' });
  if (decoded.jti && await isBlocklisted(decoded.jti)) {
    return res.status(401).json({ error: 'Unauthorized: Token has been revoked' });
  }

  try {
    const { rows } = await db.query('SELECT role FROM admin_users WHERE id = $1', [decoded.sub]);
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Unauthorized: Account no longer exists' });
    }
    decoded.role = rows[0].role;
  } catch (err) {
    console.error('[auth] Failed to fetch role:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }

  req.token = token;
  req.user = decoded;
  next();
}
