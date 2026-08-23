// backend/src/routes/clientAuth.js
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { body, validationResult } from 'express-validator';
import db from '../db.js';
import { config } from '../config.js';
import { requireClientAuth, blocklistClientToken } from '../middleware/clientAuth.js';
import {
  logLoginAttempt,
  isNewIp,
  alertNewDevice,
  DUMMY_HASH,
} from '../middleware/loginAudit.js';
import { recordFailedLogin } from '../shield/bruteForceGuard.js';

const router = Router();

function parseExpiryToMs(value, fallbackMs) {
  if (!value) return fallbackMs;
  const match = String(value).trim().match(/^(\d+)\s*(ms|s|m|h|d)?$/i);
  if (!match) return fallbackMs;
  const amount = Number(match[1]);
  const unit = (match[2] || 's').toLowerCase();
  const multipliers = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return amount * (multipliers[unit] || 1000);
}

const COOKIE_MAX_AGE_MS = parseExpiryToMs(config.jwtExpiresIn, 8 * 60 * 60 * 1000);

// Account lockout config
const MAX_FAILED_ATTEMPTS = 5;
const BASE_LOCKOUT_MINUTES = 15;
const MAX_LOCKOUT_MINUTES = 360; // 6 hours

function computeLockoutMinutes(failedCount) {
  if (failedCount < MAX_FAILED_ATTEMPTS) return 0;
  const minutes = BASE_LOCKOUT_MINUTES * Math.pow(2, failedCount - MAX_FAILED_ATTEMPTS);
  return Math.min(minutes, MAX_LOCKOUT_MINUTES);
}

/**
 * POST /api/client/login
 */
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').isString().trim().notEmpty(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Invalid credentials' });
  }

  const { email, password } = req.body;

  // Honeypot check
  if (req.body.website_url && req.body.website_url.trim().length > 0) {
    return res.status(400).json({ error: 'Invalid request' });
  }

  try {
    const result = await db.query('SELECT * FROM clients WHERE email = $1', [email]);
    const client = result.rows[0];

    // FIX C7: ALWAYS run bcrypt.compare to keep timing constant, regardless of
    // whether the email exists or the account is locked. This prevents an
    // attacker from distinguishing "email exists & locked" (fast 423) from
    // "email doesn't exist" (slow bcrypt) by response time.
    const passwordMatches = await bcrypt.compare(password, client?.password_hash || DUMMY_HASH);

    // Now that bcrypt is done, check lockout. The timing difference between
    // locked and non-locked is now just a few JS ops, not a full bcrypt round.
    if (client?.locked_until && new Date(client.locked_until) > new Date()) {
      const remainingSec = Math.ceil((new Date(client.locked_until) - new Date()) / 1000);
      return res.status(423).json({
        error: 'Account temporarily locked due to repeated failed login attempts.',
        retryAfter: remainingSec,
      });
    }

    if (!client || !passwordMatches) {
      // Log the failed attempt
      await logLoginAttempt({
        clientId: client?.id ?? null,
        email,
        ip: req.ip,
        success: false,
        userAgent: req.headers['user-agent'],
      });

      // IP-level guard
      await recordFailedLogin(req.ip);

      // Increment account-level failure count if the email exists
      if (client) {
        const newCount = (client.failed_login_count || 0) + 1;
        const lockoutMinutes = computeLockoutMinutes(newCount);
        const lockedUntil = lockoutMinutes > 0
          ? new Date(Date.now() + lockoutMinutes * 60 * 1000)
          : null;

        await db.query(
          'UPDATE clients SET failed_login_count = $1, locked_until = $2 WHERE id = $3',
          [newCount, lockedUntil, client.id]
        );
      }

      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Successful login — reset failure counters
    await db.query(
      'UPDATE clients SET failed_login_count = 0, locked_until = NULL WHERE id = $1',
      [client.id]
    );

    const newDevice = await isNewIp(client.id, req.ip);

    // Log success
    await logLoginAttempt({
      clientId: client.id,
      email,
      ip: req.ip,
      success: true,
      userAgent: req.headers['user-agent'],
    });

    if (newDevice) {
      await alertNewDevice({
        clientId: client.id,
        email: client.email,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      });
    }

    const jti = crypto.randomUUID();
    const token = jwt.sign(
      {
        sub: client.id,
        email: client.email,
        role: 'client',
        jti,
      },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn }
    );

    await db.query(
      `INSERT INTO client_sessions
       (client_id, jti, ip_address, user_agent, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (jti) DO NOTHING`,
      [
        client.id,
        jti,
        req.ip,
        req.headers['user-agent'] || null,
        new Date(Date.now() + COOKIE_MAX_AGE_MS),
      ]
    );

    res.cookie('clientToken', token, {
      httpOnly: true,
      secure: config.isProduction,
      sameSite: 'strict',
      maxAge: COOKIE_MAX_AGE_MS,
    });

    res.json({
      success: true,
      email: client.email,
      companyName: client.company_name,
      newDeviceAlert: newDevice,
    });
  } catch (err) {
    console.error('[clientAuth] Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/client/logout
 */
router.post('/logout', requireClientAuth, async (req, res) => {
  if (req.client?.jti) {
    const expiresAt = req.client.exp
      ? new Date(req.client.exp * 1000)
      : new Date(Date.now() + COOKIE_MAX_AGE_MS);
    await blocklistClientToken(req.client.jti, expiresAt);
    await db.query('DELETE FROM client_sessions WHERE jti = $1', [req.client.jti]);
  }
  res.clearCookie('clientToken');
  res.json({ success: true });
});

/**
 * GET /api/client/me
 */
router.get('/me', requireClientAuth, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, company_name, email, created_at FROM clients WHERE id = $1',
      [req.client.sub]
    );
    const client = result.rows[0];
    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }
    res.json({ client });
  } catch (err) {
    console.error('[clientAuth] /me error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
