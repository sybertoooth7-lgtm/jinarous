// backend/src/routes/clientAuth.js
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { body, validationResult } from 'express-validator';
import db from '../db.js';
import { config } from '../config.js';
import { recordFailedLogin } from '../shield/bruteForceGuard.js';
import { logLoginAttempt, isNewIp, alertNewDevice } from '../middleware/loginAudit.js';
import { parseExpiryToMs } from '../lib/parseExpiry.js';

const router = Router();
// Derived from config.jwtExpiresIn instead of a hardcoded value, so the
// cookie, the DB session row, and the JWT itself always agree on how long
// a client session actually lasts.
const COOKIE_MAX_AGE_MS = parseExpiryToMs(config.jwtExpiresIn, 2 * 60 * 60 * 1000);
const DUMMY_HASH = '$2a$12$abcdefghijklmnopqrstuvwxycdefghijklmnopqrstu';

function computeLockoutMinutes(count) {
  if (count <= 3) return 0;
  if (count <= 5) return 15;
  if (count <= 7) return 30;
  if (count <= 9) return 60;
  return 360; // 6 hours cap
}

router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').isString().trim().notEmpty(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Invalid credentials' });
  }

  const { email, password } = req.body;

  // Server-side honeypot check (bots bypassing frontend)
  if (req.body.website_url && req.body.website_url.trim().length > 0) {
    return res.status(400).json({ error: 'Invalid request' });
  }

  try {
    const result = await db.query('SELECT * FROM clients WHERE email = $1', [email]);
    const client = result.rows[0];

    // === TIMING-SAFE: Always run bcrypt first ===
    const passwordMatches = await bcrypt.compare(password, client?.password_hash || DUMMY_HASH);

    // NOW check lockout (after bcrypt, so timing is constant)
    if (client?.locked_until && new Date(client.locked_until) > new Date()) {
      const remainingSec = Math.ceil((new Date(client.locked_until) - new Date()) / 1000);
      return res.status(423).json({
        error: 'Account temporarily locked due to repeated failed login attempts.',
        retryAfter: remainingSec,
      });
    }

    if (!client || !passwordMatches) {
      await logLoginAttempt({ clientId: client?.id ?? null, email, ip: req.ip, success: false, userAgent: req.headers['user-agent'] });
      await recordFailedLogin(req.ip);

      if (client) {
        const newCount = (client.failed_login_count || 0) + 1;
        const lockoutMinutes = computeLockoutMinutes(newCount);
        const lockedUntil = lockoutMinutes > 0
          ? new Date(Date.now() + lockoutMinutes * 60 * 1000)
          : null;
        await db.query('UPDATE clients SET failed_login_count = $1, locked_until = $2 WHERE id = $3', [newCount, lockedUntil, client.id]);
      }

      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Successful login
    await db.query('UPDATE clients SET failed_login_count = 0, locked_until = NULL WHERE id = $1', [client.id]);
    const newDevice = await isNewIp(client.id, req.ip);
    await logLoginAttempt({ clientId: client.id, email, ip: req.ip, success: true, userAgent: req.headers['user-agent'] });
    if (newDevice) {
      await alertNewDevice({ clientId: client.id, email: client.email, ip: req.ip, userAgent: req.headers['user-agent'] });
    }

    const jti = crypto.randomUUID();
    const token = jwt.sign(
      { sub: client.id, email: client.email, role: 'client', jti },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn }
    );

    await db.query(
      `INSERT INTO client_sessions (client_id, jti, ip_address, user_agent, expires_at)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (jti) DO NOTHING`,
      [client.id, jti, req.ip, req.headers['user-agent'] || null, new Date(Date.now() + COOKIE_MAX_AGE_MS)]
    );

    res.cookie('clientToken', token, {
      httpOnly: true,
      secure: config.isProduction,
      sameSite: 'strict',
      maxAge: COOKIE_MAX_AGE_MS,
    });

    res.json({ success: true, email: client.email, companyName: client.company_name, newDeviceAlert: newDevice });
  } catch (err) {
    console.error('[clientAuth] Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/logout', async (req, res) => {
  const token = req.cookies?.clientToken;
  if (!token) return res.json({ success: true });
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    if (decoded.jti) {
      // Use the token's own exp claim, not COOKIE_MAX_AGE_MS — if
      // JWT_EXPIRES_IN is ever changed, a stale hardcoded window here
      // would let a "logged out" token remain replayable for however
      // long the real token outlives the blocklist entry.
      const expiresAt = decoded.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + COOKIE_MAX_AGE_MS);
      await db.query(
        `INSERT INTO token_blocklist (jti, expires_at) VALUES ($1, $2) ON CONFLICT (jti) DO NOTHING`,
        [decoded.jti, expiresAt]
      );
      await db.query('DELETE FROM client_sessions WHERE jti = $1', [decoded.jti]);
    }
  } catch {
    // ignore invalid token on logout
  }
  res.clearCookie('clientToken', { httpOnly: true, secure: config.isProduction, sameSite: 'strict' });
  res.json({ success: true });
});

export default router;
