import jwt from 'jsonwebtoken';
import db from '../db.js';
import { config } from '../config.js';

// Backed by the `token_blocklist` table (migration 005) rather than an
// in-memory Set. An in-memory blocklist doesn't survive a restart, and
// under CLUSTER_MODE each worker has its own copy — a token revoked via
// one worker's logout request would still be accepted by every other
// worker, since they'd never see that Set update. The table is shared
// across all workers and survives restarts.
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
    // Token is cryptographically valid; allow through rather than hard-lock
    // admins out during a transient DB blip.
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

  if (decoded.jti && await isBlocklisted(decoded.jti)) {
    return res.status(401).json({ error: 'Unauthorized: Token has been revoked' });
  }

  req.token = token;
  req.user = decoded;
  next();
}
