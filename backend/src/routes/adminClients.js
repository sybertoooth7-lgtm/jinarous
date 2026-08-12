// routes/adminClients.js
// Admin-facing: create/list clients, view any client's compliance status,
// and update individual checklist items after an assessment.
// Mount under requireAuth (your existing admin auth).
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { body, param, validationResult } from 'express-validator';
import db from '../db.js';

const router = Router();

const VALID_STATUSES = ['pending', 'in_progress', 'passing', 'failing', 'not_applicable'];

/**
 * POST /api/admin/clients
 * Creates a new client account. Generates a random temporary password
 * and returns it once in the response — admin relays it to the client
 * out-of-band (email/call). It is never stored or logged in plaintext.
 */
router.post('/', [
  body('companyName').isString().trim().notEmpty(),
  body('email').isEmail().normalizeEmail(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { companyName, email } = req.body;
  const tempPassword = crypto.randomBytes(9).toString('base64url'); // ~12 chars, URL-safe

  try {
    const passwordHash = await bcrypt.hash(tempPassword, 12);
    const result = await db.query(
      `INSERT INTO clients (company_name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, company_name, email, created_at`,
      [companyName, email, passwordHash]
    );

    res.status(201).json({
      client: result.rows[0],
      temporaryPassword: tempPassword, // shown once — relay to client securely, do not log this response
    });
  } catch (err) {
    if (err.code === '23505') { // unique_violation
      return res.status(409).json({ error: 'A client with that email already exists.' });
    }
    console.error('[adminClients] Failed to create client:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/clients
 * Lists all clients.
 */
router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, company_name, email, created_at FROM clients ORDER BY created_at DESC'
    );
    res.json({ clients: result.rows });
  } catch (err) {
    console.error('[adminClients] Failed to list clients:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/clients/:id/compliance
 * Full checklist + this client's current status on each item.
 */
router.get('/:id/compliance', [
  param('id').isInt().withMessage('Invalid client id.'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const result = await db.query(
      `SELECT
         ci.id, ci.framework, ci.item_key, ci.title, ci.description, ci.sort_order,
         COALESCE(ccs.status, 'pending') AS status,
         ccs.notes,
         ccs.updated_by,
         ccs.updated_at
       FROM compliance_items ci
       LEFT JOIN client_compliance_status ccs
         ON ccs.item_id = ci.id AND ccs.client_id = $1
       ORDER BY ci.framework, ci.sort_order`,
      [req.params.id]
    );
    res.json({ items: result.rows });
  } catch (err) {
    console.error('[adminClients] Failed to fetch compliance status:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /api/admin/clients/:id/compliance/:itemId
 * Updates (or creates) a client's status on a single checklist item.
 */
router.patch('/:id/compliance/:itemId', [
  param('id').isInt().withMessage('Invalid client id.'),
  param('itemId').isInt().withMessage('Invalid item id.'),
  body('status').isIn(VALID_STATUSES),
  body('notes').optional().isString().trim(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { status, notes } = req.body;
  const adminEmail = req.user?.email || 'unknown';

  try {
    const result = await db.query(
      `INSERT INTO client_compliance_status (client_id, item_id, status, notes, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (client_id, item_id)
       DO UPDATE SET status = EXCLUDED.status, notes = EXCLUDED.notes,
                     updated_by = EXCLUDED.updated_by, updated_at = NOW()
       RETURNING *`,
      [req.params.id, req.params.itemId, status, notes || null, adminEmail]
    );
    res.json({ success: true, status: result.rows[0] });
  } catch (err) {
    console.error('[adminClients] Failed to update compliance status:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
