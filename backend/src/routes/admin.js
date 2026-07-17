import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { body, query, param, validationResult } from 'express-validator';
import db from '../db.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again later.' },
});

// General ceiling on authenticated admin API usage, independent of the
// stricter login limiter above - guards against a leaked/stolen token being
// used to hammer the submissions endpoints.
const adminApiLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
});

router.use(adminApiLimiter);

// --- Auth ---------------------------------------------------------------

router.post(
  '/login',
  loginLimiter,
  [body('email').trim().isEmail(), body('password').notEmpty()],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const { email, password } = req.body;
    const admin = db.prepare('SELECT * FROM admin_users WHERE email = ?').get(email.toLowerCase());

    if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = jwt.sign(
      { sub: admin.id, email: admin.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    res.json({ token, email: admin.email });
  }
);

router.get('/me', requireAdmin, (req, res) => {
  res.json({ email: req.admin.email });
});

// --- Submissions ----------------------------------------------------------

router.get(
  '/submissions',
  requireAdmin,
  [
    query('status').optional().isIn(['new', 'read', 'archived']),
    query('search').optional().trim().isLength({ max: 200 }),
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('pageSize').optional().isInt({ min: 1, max: 100 }).toInt(),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Invalid query parameters.', details: errors.array() });
    }

    const page = req.query.page || 1;
    const pageSize = req.query.pageSize || 25;
    const offset = (page - 1) * pageSize;

    const clauses = [];
    const params = {};

    if (req.query.status) {
      clauses.push('status = @status');
      params.status = req.query.status;
    }
    if (req.query.search) {
      clauses.push(
        '(first_name LIKE @search OR last_name LIKE @search OR email LIKE @search OR company LIKE @search)'
      );
      params.search = `%${req.query.search}%`;
    }

    const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    const total = db
      .prepare(`SELECT COUNT(*) AS count FROM submissions ${whereSql}`)
      .get(params).count;

    const rows = db
      .prepare(
        `SELECT id, first_name, last_name, email, company, message, status, created_at
         FROM submissions ${whereSql}
         ORDER BY created_at DESC
         LIMIT @limit OFFSET @offset`
      )
      .all({ ...params, limit: pageSize, offset });

    res.json({ total, page, pageSize, submissions: rows });
  }
);

router.patch(
  '/submissions/:id/status',
  requireAdmin,
  [param('id').isInt().toInt(), body('status').isIn(['new', 'read', 'archived'])],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Invalid request.', details: errors.array() });
    }

    const result = db
      .prepare('UPDATE submissions SET status = ? WHERE id = ?')
      .run(req.body.status, req.params.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Submission not found.' });
    }

    res.json({ success: true });
  }
);

router.delete('/submissions/:id', requireAdmin, [param('id').isInt().toInt()], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Invalid submission id.' });
  }

  const result = db.prepare('DELETE FROM submissions WHERE id = ?').run(req.params.id);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Submission not found.' });
  }

  res.json({ success: true });
});

router.get('/stats', requireAdmin, (req, res) => {
  const total = db.prepare('SELECT COUNT(*) AS c FROM submissions').get().c;
  const byStatus = db
    .prepare('SELECT status, COUNT(*) AS c FROM submissions GROUP BY status')
    .all();
  const last7Days = db
    .prepare(
      `SELECT date(created_at) AS day, COUNT(*) AS c
       FROM submissions
       WHERE created_at >= datetime('now', '-7 days')
       GROUP BY day ORDER BY day ASC`
    )
    .all();

  res.json({ total, byStatus, last7Days });
});

export default router;
