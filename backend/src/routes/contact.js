import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { body, validationResult } from 'express-validator';
import db from '../db.js';
import { recordContactAttempt, recordContactSuccess, recordHoneypotBlocked } from '../stats.js';

const router = Router();

const contactLimiter = rateLimit({
  windowMs: (Number(process.env.CONTACT_RATE_LIMIT_WINDOW_MINUTES) || 15) * 60 * 1000,
  max: Number(process.env.CONTACT_RATE_LIMIT_MAX) || 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests from this device. Please try again later.' },
});

const validators = [
  body('firstName').trim().notEmpty().withMessage('First name is required.').isLength({ max: 100 }),
  body('lastName').trim().notEmpty().withMessage('Last name is required.').isLength({ max: 100 }),
  body('email').trim().isEmail().withMessage('A valid email is required.').normalizeEmail(),
  body('company').optional({ checkFalsy: true }).trim().isLength({ max: 200 }),
  body('message').optional({ checkFalsy: true }).trim().isLength({ max: 5000 }),
  // Honeypot field - real users never fill this in; bots usually do.
  body('website').optional({ checkFalsy: true }).isEmpty().withMessage('Spam detected.'),
];

const insertSubmission = db.prepare(`
  INSERT INTO submissions (first_name, last_name, email, company, message, ip_address, user_agent)
  VALUES (@firstName, @lastName, @email, @company, @message, @ip, @userAgent)
`);

router.post('/', contactLimiter, validators, (req, res) => {
  recordContactAttempt();

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const isHoneypot = errors.array().some((e) => e.path === 'website');
    if (isHoneypot) recordHoneypotBlocked();
    return res.status(400).json({ error: 'Validation failed.', details: errors.array() });
  }

  const { firstName, lastName, email, company = '', message = '' } = req.body;

  const result = insertSubmission.run({
    firstName,
    lastName,
    email,
    company,
    message,
    ip: req.ip,
    userAgent: req.get('user-agent') || '',
  });

  recordContactSuccess();

  return res.status(201).json({
    success: true,
    id: result.lastInsertRowid,
    message: 'Your request has been received. Our team will follow up shortly.',
  });
});

export default router;
