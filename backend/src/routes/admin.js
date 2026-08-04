const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { body, param, query, validationResult } = require('express-validator');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// In-memory token blocklist (use Redis in production for multi-instance deployments)
const tokenBlocklist = new Set();

// Helper: constant-time comparison dummy hash (60 chars, bcrypt format)
const DUMMY_HASH = '$2b$10$abcdefghijklmnopqrstuvwxycdefghijklmnopqrstu';

/**
 * POST /api/admin/login
 * Fix #3: Timing attack — always run bcrypt.compare regardless of user existence
 * Fix #4: Cookie maxAge tracks JWT_EXPIRES_IN dynamically
 */
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').isString().trim().notEmpty()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, password } = req.body;

  try {
    const result = await db.query('SELECT * FROM admins WHERE email = $1', [email]);
    const user = result.rows[0];

    // Fix #3: Always compare to prevent timing attacks
    const hashToCompare = user ? user.password_hash : DUMMY_HASH;
    const valid = await bcrypt.compare(password, hashToCompare);

    if (!user || !valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Fix #2: Add jti claim for token revocation support
    const jti = crypto.randomUUID();
    const token = jwt.sign(
      { sub: user.id, email: user.email, jti },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    // Fix #4: Parse JWT_EXPIRES_IN to milliseconds for cookie maxAge
    const expiresInMs = (() => {
      const exp = process.env.JWT_EXPIRES_IN || '8h';
      const match = exp.match(/^(\d+)([hmsd])$/);
      if (!match) return 8 * 60 * 60 * 1000;
      const [, n, unit] = match;
      const multipliers = { s: 1000, m: 60 * 1000, h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000 };
      return parseInt(n, 10) * (multipliers[unit] || multipliers.h);
    })();

    res.cookie('adminToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: expiresInMs
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/admin/logout
 * Fix #2: Revoke the current token by adding its jti to the blocklist
 */
router.post('/logout', requireAuth, async (req, res) => {
  const token = req.cookies?.adminToken || req.headers.authorization?.replace('Bearer ', '');
  if (token) {
    try {
      const decoded = jwt.decode(token);
      if (decoded?.jti) tokenBlocklist.add(decoded.jti);
    } catch {
      // Ignore decode errors
    }
  }
  res.clearCookie('adminToken');
  res.json({ success: true });
});

/**
 * GET /api/admin/me
 * Fix #13: Return current authenticated admin user
 */
router.get('/me', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, email, created_at FROM admins WHERE id = $1',
      [req.user.sub]
    );
    const user = result.rows[0];
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ user });
  } catch (err) {
    console.error('Me endpoint error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/submissions
 * Fix #10: Proper pagination with page/limit/offset
 * Fix #11: Status filtering + search
 * Fix #12: Flat response structure (total at root, not nested)
 */
router.get('/submissions', requireAuth, [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('status').optional().isIn(['new', 'read', 'replied', 'archived']),
  query('search').optional().trim().escape()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const page = req.query.page || 1;
  const limit = req.query.limit || 20;
  const offset = (page - 1) * limit;
  const status = req.query.status;
  const search = req.query.search;

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

    const countResult = await db.query(
      `SELECT COUNT(*) FROM contacts ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const dataResult = await db.query(
      `SELECT * FROM contacts ${whereClause} ORDER BY created_at DESC LIMIT $${pIdx++} OFFSET $${pIdx++}`,
      [...params, limit, offset]
    );

    // Fix #12: Flat response — dashboard expects total at root level
    res.json({
      data: dataResult.rows,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    });
  } catch (err) {
    console.error('Submissions error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /api/admin/submissions/:id/status
 * Fix #14: Update submission status
 */
router.patch('/submissions/:id/status', requireAuth, [
  param('id').isUUID(),
  body('status').isIn(['new', 'read', 'replied', 'archived'])
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const result = await db.query(
      'UPDATE contacts SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [req.body.status, req.params.id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Submission not found' });
    }
    res.json({ success: true, submission: result.rows[0] });
  } catch (err) {
    console.error('Update status error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/admin/submissions/:id
 * Fix #14: Delete a submission
 */
router.delete('/submissions/:id', requireAuth, [
  param('id').isUUID()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const result = await db.query('DELETE FROM contacts WHERE id = $1', [req.params.id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Submission not found' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Delete submission error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = { router, tokenBlocklist };
