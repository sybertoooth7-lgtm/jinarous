// backend/src/routes/adminUsers.js
// Superadmin-only: manage other admin accounts.
// Mount under requireAuth + requireSuperAdmin.

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { body, param, validationResult } from 'express-validator';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { requireSuperAdmin } from '../middleware/rbac.js';
import { recordAuditLog } from '../middleware/auditLog.js';

const router = Router();

/**
 * GET /api/admin/users
 * List all admin users (superadmin only).
 */
router.get('/', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT id, email, role, created_at FROM admin_users ORDER BY created_at DESC'
    );
    res.json({ users: rows });
  } catch (err) {
    console.error('[adminUsers] Failed to list users:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/admin/users
 * Create a new admin user (superadmin only).
 */
router.post('/', requireAuth, requireSuperAdmin, [
  body('email').isEmail().normalizeEmail(),
  body('role').isIn(['readonly', 'admin', 'superadmin']),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, role } = req.body;
  const tempPassword = crypto.randomBytes(9).toString('base64url'); // ~12 chars

  try {
    const passwordHash = await bcrypt.hash(tempPassword, 12);
    const result = await db.query(
      `INSERT INTO admin_users (email, password_hash, role)
       VALUES ($1, $2, $3)
       RETURNING id, email, role, created_at`,
      [email, passwordHash, role]
    );

    await recordAuditLog({
      adminEmail: req.user.email,
      action: 'admin_user.create',
      targetTable: 'admin_users',
      targetId: result.rows[0].id,
      oldValue: null,
      newValue: { email: result.rows[0].email, role: result.rows[0].role },
    });

    res.status(201).json({
      user: result.rows[0],
      temporaryPassword: tempPassword, // shown once — relay securely
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'An admin with that email already exists.' });
    }
    console.error('[adminUsers] Failed to create admin:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /api/admin/users/:id/role
 * Change an admin's role (superadmin only).
 * Cannot change your own role (prevents locking yourself out).
 */
router.patch('/:id/role', requireAuth, requireSuperAdmin, [
  param('id').isInt(),
  body('role').isIn(['readonly', 'admin', 'superadmin']),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const targetId = parseInt(req.params.id, 10);
  if (targetId === req.user.sub) {
    return res.status(403).json({ error: 'You cannot change your own role.' });
  }

  try {
    const before = await db.query('SELECT role FROM admin_users WHERE id = $1', [targetId]);
    if (before.rows.length === 0) {
      return res.status(404).json({ error: 'Admin not found.' });
    }

    const result = await db.query(
      'UPDATE admin_users SET role = $1 WHERE id = $2 RETURNING id, email, role',
      [req.body.role, targetId]
    );

    await recordAuditLog({
      adminEmail: req.user.email,
      action: 'admin_user.role_change',
      targetTable: 'admin_users',
      targetId: targetId,
      oldValue: { role: before.rows[0].role },
      newValue: { role: result.rows[0].role },
    });

    res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    console.error('[adminUsers] Failed to update role:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/admin/users/:id
 * Delete an admin account (superadmin only).
 * Cannot delete yourself.
 */
router.delete('/:id', requireAuth, requireSuperAdmin, [
  param('id').isInt(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const targetId = parseInt(req.params.id, 10);
  if (targetId === req.user.sub) {
    return res.status(403).json({ error: 'You cannot delete your own account.' });
  }

  try {
    const result = await db.query(
      'DELETE FROM admin_users WHERE id = $1 RETURNING id, email, role',
      [targetId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Admin not found.' });
    }

    await recordAuditLog({
      adminEmail: req.user.email,
      action: 'admin_user.delete',
      targetTable: 'admin_users',
      targetId: targetId,
      oldValue: result.rows[0],
      newValue: null,
    });

    res.json({ success: true });
  } catch (err) {
    console.error('[adminUsers] Failed to delete admin:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
