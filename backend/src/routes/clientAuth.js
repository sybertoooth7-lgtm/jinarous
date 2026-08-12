// routes/clientAuth.js
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { body, validationResult } from 'express-validator';
import db from '../db.js';
import { config } from '../config.js';
import { requireClientAuth, blocklistClientToken } from '../middleware/clientAuth.js';

const router = Router();

// Same timing-attack mitigation as admin.js: compare against a dummy
// hash even when the email doesn't exist, so login response time doesn't
// leak which emails are registered clients.
const DUMMY_HASH = '$2b$12$c.ByGOhklqTXtY6UiWrCieVW3v1ZsI5tlBj/MfE9V92LjUYa9iuHu';

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

  try {
    const result = await db.query('SELECT * FROM clients WHERE email = $1', [email]);
    const client = result.rows[0];

    const passwordMatches = await bcrypt.compare(password, client?.password_hash || DUMMY_HASH);
    if (!client || !passwordMatches) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const jti = crypto.randomUUID();
    const token = jwt.sign(
      { sub: client.id, email: client.email, role: 'client', jti },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn }
    );

    res.cookie('clientToken', token, {
      httpOnly: true,
      secure: config.isProduction,
      sameSite: 'strict',
      maxAge: COOKIE_MAX_AGE_MS,
    });

    res.json({ success: true, email: client.email, companyName: client.company_name });
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
    const expiresAt = req.client.exp ? new Date(req.client.exp * 1000) : new Date(Date.now() + COOKIE_MAX_AGE_MS);
    await blocklistClientToken(req.client.jti, expiresAt);
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
