const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const ms = require('ms');
const { body, param, query, validationResult } = require('express-validator');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

/* ---------- Hybrid Token Blocklist (Redis if available, in-memory + TTL cleanup if not) ---------- */

let redisClient = null;
let tokenBlocklist = null;

try {
  const Redis = require('ioredis');
  if (process.env.REDIS_URL) {
    redisClient = new Redis(process.env.REDIS_URL, {
      retryStrategy: (times) => Math.min(times * 50, 2000),
      maxRetriesPerRequest: 3,
    });
    redisClient.on('error', (err) => {
      console.error('[token-blocklist] Redis error:', err.message);
    });
    console.log('[token-blocklist] Using Redis store');
  }
} catch {
  console.warn('[token-blocklist] ioredis not available. Using in-memory store (not cluster-safe).');
}

if (redisClient) {
  tokenBlocklist = {
    async add(jti, expiresIn) {
      const ttlMs = typeof expiresIn === 'string' ? ms(expiresIn) : (expiresIn || ms('8h'));
      const ttlSec = Math.max(1, Math.ceil(ttlMs / 1000));
      await redisClient.setex(`blocklist:${jti}`, ttlSec, '1');
    },
    async has(jti) {
      try {
        const result = await redisClient.get(`blocklist:${jti}`);
        return result === '1';
      } catch (err) {
        console.error('[token-blocklist] Redis has() failed:', err.message);
        return false; // fail open — token is still cryptographically valid and will expire
      }
    }
  };
} else {
  const memBlocklist = new Map(); // jti -> exp (timestamp ms)

  // Purge expired entries every 5 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [jti, exp] of memBlocklist) {
      if (exp <= now) memBlocklist.delete(jti);
    }
  }, 5 * 60 * 1000);

  tokenBlocklist = {
    async add(jti, expiresIn) {
      const ttlMs = typeof expiresIn === 'string' ? ms(expiresIn) : (expiresIn || ms('8h'));
      memBlocklist.set(jti, Date.now() + ttlMs);
    },
    async has(jti) {
      const exp = memBlocklist.get(jti);
      if (!exp) return false;
      if (exp <= Date.now()) {
        memBlocklist.delete(jti);
        return false;
      }
      return true;
    }
  };
}

/* ---------- Security Helpers ---------- */

// Real bcrypt dummy hash — prevents timing attacks on non-existent users
const DUMMY_HASH = bcrypt.hashSync('dummy_password_that_never_matches_anything', 10);

function parseExpiresInToMs(exp) {
  try {
    return ms(exp);
  } catch {
    return ms('8h');
  }
}

// Audit log helper (gracefully degrades if 'details' column missing)
async function logAudit(adminId, action, details = null) {
  const detailJson = details ? JSON.stringify(details) : null;
  try {
    await db.query(
      `INSERT INTO audit_logs (admin_id, action, details, created_at) VALUES ($1, $2, $3, NOW())`,
      [adminId, action, detailJson]
    );
  } catch (err) {
    if (err.message?.includes('details')) {
      try {
        await db.query(
          `INSERT INTO audit_logs (admin_id, action, created_at) VALUES ($1, $2, NOW())`,
          [adminId, action]
        );
      } catch (err2) {
        console.error('[audit] Fallback audit log failed:', err2.message);
      }
    } else {
      console.error('[audit] Audit log failed:', err.message);
    }
  }
}

/* ---------- Routes ---------- */

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

    // Constant-time comparison: always run bcrypt.compare
    const hashToCompare = user ? user.password_hash : DUMMY_HASH;
    const valid = await bcrypt.compare(password, hashToCompare);

    if (!user || !valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const expiresIn = process.env.JWT_EXPIRES_IN || '8h';
    const jti = crypto.randomUUID();
    const token = jwt.sign(
      { sub: user.id, email: user.email, jti },
      process.env.JWT_SECRET,
      { expiresIn }
    );

    const expiresInMs = parseExpiresInToMs(expiresIn);

    res.cookie('adminToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: expiresInMs
    });

    await logAudit(user.id, 'LOGIN', { ip: req.ip, userAgent: req.headers['user-agent'] });

    res.json({ success: true });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/logout', requireAuth, async (req, res) => {
  // Use the exact token that passed authentication
  const token = req.token;
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (decoded?.jti) {
        const expiresIn = process.env.JWT_EXPIRES_IN || '8h';
        await tokenBlocklist.add(decoded.jti, expiresIn);
      }
    } catch {
      // Ignore invalid/expired tokens
    }
  }
  res.clearCookie('adminToken');
  res.json({ success: true });
});

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

    await logAudit(req.user.sub, 'UPDATE_SUBMISSION_STATUS', {
      submissionId: req.params.id,
      newStatus: req.body.status
    });

    res.json({ success: true, submission: result.rows[0] });
  } catch (err) {
    console.error('Update status error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

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

    await logAudit(req.user.sub, 'DELETE_SUBMISSION', {
      submissionId: req.params.id
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Delete submission error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = { router, tokenBlocklist, redisClient };
