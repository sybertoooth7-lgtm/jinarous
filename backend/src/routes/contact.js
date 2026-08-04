const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../db');

const router = express.Router();

/**
 * POST /api/contact
 * Fix #6: Input escaping via express-validator .escape()
 * Fix #15: Properly store company field
 */
router.post('/', [
  body('name').trim().notEmpty().escape().isLength({ max: 100 }),
  body('email').isEmail().normalizeEmail().isLength({ max: 255 }),
  body('company').optional({ checkFalsy: true }).trim().escape().isLength({ max: 150 }),
  body('message').trim().notEmpty().escape().isLength({ max: 5000 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { name, email, company, message } = req.body;

  try {
    // Fix #15: Explicitly store company field in database
    const result = await db.query(
      `INSERT INTO contacts (name, email, company, message, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'new', NOW(), NOW())
       RETURNING *`,
      [name, email, company || null, message]
    );

    res.status(201).json({ success: true, id: result.rows[0].id });
  } catch (err) {
    console.error('Contact submission error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
