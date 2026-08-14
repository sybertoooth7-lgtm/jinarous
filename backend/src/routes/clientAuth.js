// backend/src/routes/clientAuth.js — ENHANCED VERSION
// Adds login audit logging, new-device detection, and CSRF/honeypot checks.
// Does NOT include broken request signing or unstable device fingerprinting.

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

  // Honeypot check: if the hidden field is filled, silently reject
  if (req.body.website_url && req.body.website_url.trim().length > 0) {
    return res.status(400).json({ error: 'Invalid request' });
  }

  try {
    const result = await db.query('SELECT * FROM clients WHERE email = $1', [email]);
    const client = result.rows[0];

    const passwordMatches = await bcrypt.compare(password, client?.password_hash || DUMMY_HASH);
    if (!client || !passwordMatches) {
      await logLoginAttempt({
        clientId: client?.id ?? null,
        email,
        ip: req.ip,
        success: false,
        userAgent: req.headers['user-agent'],
      });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Log successful login
    await logLoginAttempt({
      clientId: client.id,
      email,
      ip: req.ip,
      success: true,
      userAgent: req.headers['user-agent'],
    });

    // Check for new IP (stable signal, unlike UA fingerprinting)
    const newDevice = await isNewIp(client.id, req.ip);
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

    // Store active session (for concurrent session limits / kill-switch)
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
    // Also remove from active sessions
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
