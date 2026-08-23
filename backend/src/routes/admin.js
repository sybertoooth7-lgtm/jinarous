import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { body, param, query, validationResult } from 'express-validator';
import db from '../db.js';
import { config } from '../config.js';
import { requireAuth, blocklistToken } from '../middleware/auth.js';
import { recordFailedLogin } from '../shield/bruteForceGuard.js';
import { recordAuditLog } from '../middleware/auditLog.js';

const router = Router();

// A precomputed bcrypt hash of a random value, compared against on every
// login attempt regardless of whether the email exists — otherwise a
// nonexistent email skips bcrypt.compare entirely and responds noticeably
// faster than a wrong password, leaking which emails are registered.
const DUMMY_HASH = '$2b$12$c.ByGOhklqTXtY6UiWrCieVW3v1ZsI5tlBj/MfE9V92LjUYa9iuHu';

const VALID_STATUSES = ['new', 'read', 'replied', 'archived'];

// Per-account lockout, mirroring clientAuth.js's — see the comment in
// migrations/017_add_admin_lockout.sql for why this exists and why the
// numbers are deliberately much shorter than the client version.
const MAX_FAILED_ATTEMPTS = 5;
const BASE_LOCKOUT_MINUTES = 5;
const MAX_LOCKOUT_MINUTES = 30;

function computeLockoutMinutes(failedCount) {
  if (failedCount < MAX_FAILED_ATTEMPTS) return 0;
  const minutes = BASE_LOCKOUT_MINUTES * Math.pow(2, failedCount - MAX_FAILED_ATTEMPTS);
  return Math.min(minutes, MAX_LOCKOUT_MINUTES);
}

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
 * POST /api/admin/login
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
    const result = await db.query('SELECT * FROM admin_users WHERE email = $1', [email]);
    const user = result.rows[0];

    // Account-level lockout check (before bcrypt to save CPU) — same
    // ordering rationale as clientAuth.js.
    if (user?.locked_until && new Date(user.locked_until) > new Date()) {
      const remainingSec = Math.ceil((new Date(user.locked_until) - new Date()) / 1000);
      return res.status(423).json({
        error: 'Account temporarily locked due to repeated failed login attempts.',
        retryAfter: remainingSec,
      });
    }

    const passwordMatches = await bcrypt.compare(password, user?.password_hash || DUMMY_HASH);
    if (!user || !passwordMatches) {
      if (user) {
        const newCount = (user.failed_login_count || 0) + 1;
        const lockoutMinutes = computeLockoutMinutes(newCount);
        const lockedUntil = lockoutMinutes > 0
          ? new Date(Date.now() + lockoutMinutes * 60 * 1000)
          : null;
        await db.query(
          'UPDATE admin_users SET failed_login_count = $1, locked_until = $2 WHERE id = $3',
          [newCount, lockedUntil, user.id]
        );
      }
      const nowBlocked = await recordFailedLogin(req.ip);
      if (nowBlocked) {
        return res.status(403).json({ error: 'Too many failed attempts. Access denied.' });
      }
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Successful login — reset failure counter
    await db.query(
      'UPDATE admin_users SET failed_login_count = 0, locked_until = NULL WHERE id = $1',
      [user.id]
    );

    const jti = crypto.randomUUID();
    const token = jwt.sign(
      { sub: user.id, email: user.email, jti },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn }
    );

    res.cookie('adminToken', token, {
      httpOnly: true,
      secure: config.isProduction,
      sameSite: 'strict',
      maxAge: COOKIE_MAX_AGE_MS,
    });

    res.json({ success: true, email: user.email });
  } catch (err) {
    console.error('[admin] Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/admin/logout
 */
router.post('/logout', requireAuth, async (req, res) => {
  if (req.user?.jti) {
    const expiresAt = req.user.exp ? new Date(req.user.exp * 1000) : new Date(Date.now() + COOKIE_MAX_AGE_MS);
    await blocklistToken(req.user.jti, expiresAt);
  }
  res.clearCookie('adminToken');
  res.json({ success: true });
});

/**
 * GET /api/admin/me
 */
router.get('/me', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, email, created_at FROM admin_users WHERE id = $1',
      [req.user.sub]
    );
    const user = result.rows[0];
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ user });
  } catch (err) {
    console.error('[admin] /me error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/submissions
 */
router.get('/submissions', requireAuth, [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('status').optional().isIn(VALID_STATUSES),
  query('search').optional().trim(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const page = req.query.page || 1;
  const limit = req.query.limit || 20;
  const offset = (page - 1) * limit;
  const { status, search } = req.query;

  try {
    let whereClause = 'WHERE 1=1';
    const params = [];
    let pIdx = 1;

    if (status) {
      whereClause += ` AND status = $${pIdx++}`;
      params.push(status);
    }
    if (search) {
      whereClause += ` AND (name ILIKE $${pIdx} OR email ILIKE $${pIdx} OR company ILIKE $${pIdx} OR message ILIKE $${pIdx})`;
      params.push(`%${search}%`);
      pIdx++;
    }

    const countResult = await db.query(`SELECT COUNT(*) FROM contacts ${whereClause}`, params);
    const total = parseInt(countResult.rows[0].count, 10);

    const dataResult = await db.query(
      `SELECT * FROM contacts ${whereClause} ORDER BY created_at DESC LIMIT $${pIdx++} OFFSET $${pIdx++}`,
      [...params, limit, offset]
    );

    res.json({
      data: dataResult.rows,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error('[admin] Submissions error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /api/admin/submissions/:id/status
 */
router.patch('/submissions/:id/status', requireAuth, [
  param('id').isInt().withMessage('Invalid submission id.'),
  body('status').isIn(VALID_STATUSES),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const before = await db.query('SELECT status FROM contacts WHERE id = $1', [req.params.id]);
    const result = await db.query(
      'UPDATE contacts SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [req.body.status, req.params.id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Submission not found' });
    }
    await recordAuditLog({
      adminEmail: req.user.email,
      action: 'submission.status_update',
      targetTable: 'contacts',
      targetId: req.params.id,
      oldValue: before.rows[0] ? { status: before.rows[0].status } : null,
      newValue: { status: req.body.status },
    });
    res.json({ success: true, submission: result.rows[0] });
  } catch (err) {
    console.error('[admin] Update status error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/admin/submissions/:id
 */
router.delete('/submissions/:id', requireAuth, [
  param('id').isInt().withMessage('Invalid submission id.'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const result = await db.query('DELETE FROM contacts WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Submission not found' });
    }
    await recordAuditLog({
      adminEmail: req.user.email,
      action: 'submission.delete',
      targetTable: 'contacts',
      targetId: req.params.id,
      oldValue: result.rows[0],
      newValue: null,
    });
    res.json({ success: true });
  } catch (err) {
    console.error('[admin] Delete submission error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
