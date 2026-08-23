// middleware/clientAuth.js
// Mirrors middleware/auth.js (admin auth) but issues/checks a separate
// cookie and requires a `role: 'client'` claim, so a stolen client token
// can't be replayed against admin routes (and vice versa) even though
// both are signed with the same JWT_SECRET.
import jwt from 'jsonwebtoken';
import db from '../db.js';
import { config } from '../config.js';

export async function blocklistClientToken(jti, expiresAt) {
  if (!jti) return;
  try {
    await db.query(
      `INSERT INTO token_blocklist (jti, expires_at) VALUES ($1, $2)
       ON CONFLICT (jti) DO NOTHING`,
      [jti, expiresAt]
    );
  } catch (err) {
    console.error('[clientAuth] Failed to blocklist token:', err.message);
  }
}

async function isBlocklisted(jti) {
  if (!jti) return false;
  try {
    // FIX C6: also check expires_at so stale entries don't stay blocked forever
    const result = await db.query(
      'SELECT 1 FROM token_blocklist WHERE jti = $1 AND expires_at > NOW()',
      [jti]
    );
    return result.rows.length > 0;
  } catch (err) {
    console.error('[clientAuth] Blocklist check failed:', err.message);
    return false;
  }
}

export async function requireClientAuth(req, res, next) {
  const token = req.cookies?.clientToken || req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, config.jwtSecret);
  } catch {
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
  }

  if (decoded.role !== 'client') {
    return res.status(401).json({ error: 'Unauthorized: Wrong token type' });
  }

  if (decoded.jti && await isBlocklisted(decoded.jti)) {
    return res.status(401).json({ error: 'Unauthorized: Token has been revoked' });
  }

  req.token = token;
  req.client = decoded;
  next();
}
