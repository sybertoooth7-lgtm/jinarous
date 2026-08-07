import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import db from '../db.js';
import { recordContactAttempt, recordContactSuccess, recordHoneypotBlocked } from '../stats.js';
import { sendContactNotification } from '../lib/email.js';

const router = Router();

router.post(
  '/',
  [
    // No .escape() here on purpose: dashboard.js already HTML-escapes every
    // field at render time via its own escapeHtml()/textContent. Escaping
    // again here would double-encode stored data (e.g. "AT&T" becoming
    // "AT&amp;amp;T" permanently in the database) without adding any real
    // protection beyond what render-time escaping already provides.
    body('name').trim().notEmpty().isLength({ max: 100 }),
    body('email').trim().isEmail().normalizeEmail().isLength({ max: 255 }),
    body('company').optional({ checkFalsy: true }).trim().isLength({ max: 150 }),
    body('message').trim().notEmpty().isLength({ max: 5000 }),
    body('honeypot').optional({ checkFalsy: true }).trim(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    recordContactAttempt();

    if (req.body.honeypot) {
      recordHoneypotBlocked();
      return res.status(200).json({ success: true });
    }

    const { name, email, company, message } = req.body;

    try {
      const result = await db.query(
        `INSERT INTO contacts (name, email, company, message, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'new', NOW(), NOW())
         RETURNING id`,
        [name, email, company || null, message]
      );

      recordContactSuccess();

      sendContactNotification({ name, company, email, message, id: result.rows[0].id }).catch(err => {
        console.error('[email] Notification failed:', err.message);
      });

      res.status(201).json({ success: true, id: result.rows[0].id });
    } catch (err) {
      console.error('[contact] DB error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export default router;
