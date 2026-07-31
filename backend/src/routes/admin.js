import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import db from '../db.js';
import { config } from '../config.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

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

      if (!user || !(await bcrypt.compare(password, user.password_hash))) {
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
        maxAge: 8 * 60 * 60 * 1000,
      });

      res.json({ token, email: user.email });
    } catch (err) {
      console.error('[admin] Login error:', err);
      res.status(500).json({ error: 'Login failed.' });
    }
  }
);

router.get('/submissions', authenticateToken, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM contacts ORDER BY created_at DESC LIMIT 100'
    );
    res.json({ submissions: result.rows });
  } catch (err) {
    console.error('[admin] Fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch submissions.' });
  }
});

export default router;
