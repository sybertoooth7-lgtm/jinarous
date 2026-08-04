import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { body, param, query, validationResult } from 'express-validator';
import db from '../db.js';
import { config } from '../config.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// A precomputed bcrypt hash of a random value, used only so that login always
// takes roughly the same amount of time whether or not the email exists —
// otherwise a nonexistent email skips bcrypt.compare entirely and responds
// noticeably faster than a wrong password, which leaks which emails are
// registered.
const DUMMY_HASH = '$2b$12$c.ByGOhklqTXtY6UiWrCieVW3v1ZsI5tlBj/MfE9V92LjUYa9iuHu';

// Parses simple Go/Vercel-style durations ("8h", "15m", "1d") or a plain
// number of seconds, into milliseconds — used so the login cookie's maxAge
// always matches JWT_EXPIRES_IN instead of being hardcoded separately.
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
const VALID_STATUSES = ['new', 'read', 'archived'];

router.post(
  '/login',
  [
    body('email').trim().isEmail().normalizeEmail(),
    body('password').isLength({ min: 1 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Invalid credentials.' });
    }

    const { email, password } = req.body;

    try {
      const result = await db.query('SELECT * FROM admin_users WHERE email = $1', [email]);
      const user = result.rows[0];

      // Always run bcrypt.compare, even for a nonexistent user, against a
      // dummy hash, so response timing doesn't reveal whether the email
      // exists.
      const passwordMatches = await bcrypt.compare(password, user?.password_hash || DUMMY_HASH);

      if (!user || !passwordMatches) {
        return res.status(401).json({ error: 'Invalid credentials.' });
      }

      const token = jwt.sign(
        { id: user.id, email: user.email },
        config.jwtSecret,
        { expiresIn: config.jwtExpiresIn }
      );

      res.cookie('admin_token', token, {
        httpOnly: true,
        secure: config.isProduction,
        sameSite: 'strict',
        maxAge: COOKIE_MAX_AGE_MS,
      });

      res.json({ token, email: user.email });
    } catch (err) {
      console.error('[admin] Login error:', err);
      res.status(500).json({ error: 'Login failed.' });
    }
  }
);

router.get('/me', authenticateToken, (req, res) => {
  res.json({ id: req.user.id, email: req.user.email });
});

router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const totalResult = await db.query('SELECT COUNT(*) AS total FROM contacts');
    const byStatusResult = await db.query(
      'SELECT status, COUNT(*) AS c FROM contacts GROUP BY status'
    );

    res.json({
      total: parseInt(totalResult.rows[0].total, 10),
      byStatus: byStatusResult.rows.map((r) => ({ status: r.status, c: parseInt(r.c, 10) })),
    });
  } catch (err) {
    console.error('[admin] Stats error:', err);
    res.status(500).json({ error: 'Failed to fetch stats.' });
  }
});

router.get('/submissions', authenticateToken, async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 20, 1), 100);
    const offset = (page - 1) * pageSize;

    const conditions = [];
    const params = [];

    if (req.query.status && VALID_STATUSES.includes(req.query.status)) {
      params.push(req.query.status);
      conditions.push(`status = $${params.length}`);
    }

    if (req.query.search) {
      params.push(`%${req.query.search}%`);
      const idx = params.length;
      conditions.push(
        `(name ILIKE $${idx} OR email ILIKE $${idx} OR company ILIKE $${idx} OR message ILIKE $${idx})`
      );
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await db.query(
      `SELECT COUNT(*) AS total FROM contacts ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].total, 10);

    const listParams = [...params, pageSize, offset];
    const result = await db.query(
      `SELECT id, first_name, last_name, name, email, company, message, status, created_at
       FROM contacts ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
      listParams
    );

    res.json({
      submissions: result.rows,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (err) {
    console.error('[admin] Fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch submissions.' });
  }
});

router.patch(
  '/submissions/:id/status',
  authenticateToken,
  [
    param('id').isInt().withMessage('Invalid submission id.'),
    body('status').isIn(VALID_STATUSES).withMessage('Status must be new, read, or archived.'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed.', details: errors.array() });
    }

    try {
      const result = await db.query(
        'UPDATE contacts SET status = $1 WHERE id = $2 RETURNING id, status',
        [req.body.status, req.params.id]
      );

      if (!result.rows[0]) {
        return res.status(404).json({ error: 'Submission not found.' });
      }

      res.json(result.rows[0]);
    } catch (err) {
      console.error('[admin] Status update error:', err);
      res.status(500).json({ error: 'Failed to update status.' });
    }
  }
);

router.delete(
  '/submissions/:id',
  authenticateToken,
  [param('id').isInt().withMessage('Invalid submission id.')],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed.', details: errors.array() });
    }

    try {
      const result = await db.query('DELETE FROM contacts WHERE id = $1 RETURNING id', [
        req.params.id,
      ]);

      if (!result.rows[0]) {
        return res.status(404).json({ error: 'Submission not found.' });
      }

      res.status(204).end();
    } catch (err) {
      console.error('[admin] Delete error:', err);
      res.status(500).json({ error: 'Failed to delete submission.' });
    }
  }
);

export default router;
