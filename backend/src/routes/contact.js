import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import DOMPurify from 'isomorphic-dompurify';
import db from '../db.js';
import { recordContactAttempt, recordContactSuccess, recordHoneypotBlocked } from '../stats.js';
import { sendContactNotification } from '../lib/email.js';
import { contactLimiter } from '../middleware/rate-limit.js';

const router = Router();

router.post(
  '/',
  contactLimiter,
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

    // Sanitize before storing
    const sanitizedMessage = DOMPurify.sanitize(message);
    const sanitizedName = DOMPurify.sanitize(name);

    try {
      const result = await db.query(
        `INSERT INTO contacts (name, email, company, message, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'new', NOW(), NOW())
         RETURNING id`,
        [sanitizedName, email, company || null, sanitizedMessage]
      );

      recordContactSuccess();

      sendContactNotification({ name: sanitizedName, company, email, message: sanitizedMessage, id: result.rows[0].id }).catch(err => {
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
