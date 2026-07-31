import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import rateLimit from 'express-rate-limit';
import db from '../db.js';
import { recordContactAttempt, recordContactSuccess, recordHoneypotBlocked } from '../stats.js';
import { sendContactNotification } from '../lib/email.js';

const router = Router();

const contactLimiter = rateLimit({
  windowMs: (Number(process.env.CONTACT_RATE_LIMIT_WINDOW_MINUTES) || 15) * 60 * 1000,
  max: Number(process.env.CONTACT_RATE_LIMIT_MAX) || 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many contact attempts. Please try again later.' },
});

router.post(
  '/',
  contactLimiter,
  [
    body('name').trim().isLength({ min: 1, max: 100 }).escape(),
    body('email').trim().isEmail().normalizeEmail().isLength({ max: 255 }),
    body('message').trim().isLength({ min: 1, max: 5000 }).escape(),
    body('honeypot').optional({ checkFalsy: true }).trim(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Invalid input.', details: errors.array() });
    }

    recordContactAttempt();

    if (req.body.honeypot) {
      recordHoneypotBlocked();
      return res.status(200).json({ success: true });
    }

    const { name, email, message } = req.body;

    try {
      const result = await db.query(
        `INSERT INTO contacts (name, email, message, created_at)
         VALUES ($1, $2, $3, NOW())
         RETURNING id`,
        [name, email, message]
      );

      recordContactSuccess();

      sendContactNotification({ name, email, message, id: result.rows[0].id }).catch(err => {
        console.error('[email] Notification failed:', err.message);
      });

      res.status(201).json({ success: true, id: result.rows[0].id });
    } catch (err) {
      console.error('[contact] DB error:', err);
      res.status(500).json({ error: 'Failed to save submission.' });
    }
  }
);

export default router;
