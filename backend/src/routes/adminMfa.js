// backend/src/routes/adminMfa.js
// TOTP MFA enrollment, verification, and management for admin accounts.
// Mount under requireAuth at /api/admin/mfa.

import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { recordAuditLog } from '../middleware/auditLog.js';
import {
  generateSecret,
  encryptSecret,
  decryptSecret,
  getOtpauthUrl,
  verifyTOTP,
  generateBackupCodes,
  verifyBackupCode,
} from '../lib/mfa.js';

const router = Router();

/**
 * POST /api/admin/mfa/enroll
 * Step 1: Generate a new TOTP secret and return the QR code URL.
 * Does NOT enable MFA yet — the user must verify a code first.
 */
router.post('/enroll', requireAuth, async (req, res) => {
  try {
    const secret = generateSecret();
    const encrypted = encryptSecret(secret);

    // Store the secret temporarily (not enabled yet)
    await db.query(
      `UPDATE admin_users
       SET mfa_secret = $1, mfa_enabled = FALSE, mfa_backup_codes = NULL, mfa_enrolled_at = NULL
       WHERE id = $2`,
      [encrypted, req.user.sub]
    );

    const otpauthUrl = getOtpauthUrl(req.user.email, secret);

    res.json({
      success: true,
      otpauthUrl,
      manualEntryKey: secret,
      message: 'Scan the QR code with your authenticator app, then POST /api/admin/mfa/verify-enrollment with a code.',
    });
  } catch (err) {
    console.error('[adminMfa] Enroll error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/admin/mfa/verify-enrollment
 * Step 2: Verify the first TOTP code to confirm the user has set up
 * their authenticator app correctly. Only then is MFA enabled.
 */
router.post('/verify-enrollment', requireAuth, [
  body('code').isString().trim().isLength({ min: 6, max: 6 }).matches(/^\d{6}$/),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { rows } = await db.query(
      'SELECT mfa_secret FROM admin_users WHERE id = $1',
      [req.user.sub]
    );
    const user = rows[0];
    if (!user?.mfa_secret) {
      return res.status(400).json({ error: 'No enrollment in progress. Call /enroll first.' });
    }

    const secret = decryptSecret(user.mfa_secret);
    if (!verifyTOTP(secret, req.body.code)) {
      return res.status(400).json({ error: 'Invalid code. Check your authenticator app and try again.' });
    }

    // Generate backup codes
    const { plaintextCodes, hashedCodes } = await generateBackupCodes();

    // Enable MFA and store hashed backup codes
    await db.query(
      `UPDATE admin_users
       SET mfa_enabled = TRUE, mfa_backup_codes = $1, mfa_enrolled_at = NOW()
       WHERE id = $2`,
      [JSON.stringify(hashedCodes), req.user.sub]
    );

    await recordAuditLog({
      adminEmail: req.user.email,
      action: 'mfa.enroll',
      targetTable: 'admin_users',
      targetId: req.user.sub,
      oldValue: { mfa_enabled: false },
      newValue: { mfa_enabled: true },
    });

    // Show backup codes ONCE — they are never retrievable again
    res.json({
      success: true,
      message: 'MFA enabled successfully. SAVE THESE BACKUP CODES NOW — they will not be shown again.',
      backupCodes: plaintextCodes,
    });
  } catch (err) {
    console.error('[adminMfa] Verify enrollment error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/admin/mfa/disable
 * Disable MFA for the current admin. Requires password confirmation
 * and a valid TOTP code (or backup code) to prevent account takeover.
 */
router.post('/disable', requireAuth, [
  body('password').isString().trim().notEmpty(),
  body('code').isString().trim().notEmpty(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { rows } = await db.query(
      'SELECT password_hash, mfa_secret, mfa_enabled, mfa_backup_codes FROM admin_users WHERE id = $1',
      [req.user.sub]
    );
    const user = rows[0];
    if (!user?.mfa_enabled) {
      return res.status(400).json({ error: 'MFA is not enabled.' });
    }

    // Verify password first
    const bcrypt = await import('bcryptjs');
    const passwordValid = await bcrypt.compare(req.body.password, user.password_hash);
    if (!passwordValid) {
      return res.status(401).json({ error: 'Invalid password.' });
    }

    // Try TOTP first, then backup code
    const secret = decryptSecret(user.mfa_secret);
    let codeValid = verifyTOTP(secret, req.body.code);
    let usedBackup = false;

    if (!codeValid && user.mfa_backup_codes) {
      const hashedCodes = JSON.parse(user.mfa_backup_codes);
      const matchedIndex = await verifyBackupCode(req.body.code, hashedCodes);
      if (matchedIndex >= 0) {
        codeValid = true;
        usedBackup = true;
        // Remove the used backup code
        hashedCodes.splice(matchedIndex, 1);
        await db.query(
          'UPDATE admin_users SET mfa_backup_codes = $1 WHERE id = $2',
          [JSON.stringify(hashedCodes), req.user.sub]
        );
      }
    }

    if (!codeValid) {
      return res.status(401).json({ error: 'Invalid MFA code.' });
    }

    // Disable MFA
    await db.query(
      `UPDATE admin_users
       SET mfa_enabled = FALSE, mfa_secret = NULL, mfa_backup_codes = NULL, mfa_enrolled_at = NULL
       WHERE id = $1`,
      [req.user.sub]
    );

    await recordAuditLog({
      adminEmail: req.user.email,
      action: 'mfa.disable',
      targetTable: 'admin_users',
      targetId: req.user.sub,
      oldValue: { mfa_enabled: true },
      newValue: { mfa_enabled: false },
    });

    res.json({
      success: true,
      message: usedBackup
        ? 'MFA disabled. Note: you used a backup code. If you re-enable MFA, new backup codes will be generated.'
        : 'MFA disabled successfully.',
    });
  } catch (err) {
    console.error('[adminMfa] Disable error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/admin/mfa/regenerate-backup-codes
 * Generate new backup codes. Requires a valid TOTP code.
 * Old backup codes are invalidated immediately.
 */
router.post('/regenerate-backup-codes', requireAuth, [
  body('code').isString().trim().isLength({ min: 6, max: 6 }).matches(/^\d{6}$/),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { rows } = await db.query(
      'SELECT mfa_secret, mfa_enabled FROM admin_users WHERE id = $1',
      [req.user.sub]
    );
    const user = rows[0];
    if (!user?.mfa_enabled) {
      return res.status(400).json({ error: 'MFA is not enabled.' });
    }

    const secret = decryptSecret(user.mfa_secret);
    if (!verifyTOTP(secret, req.body.code)) {
      return res.status(401).json({ error: 'Invalid MFA code.' });
    }

    const { plaintextCodes, hashedCodes } = await generateBackupCodes();
    await db.query(
      'UPDATE admin_users SET mfa_backup_codes = $1 WHERE id = $2',
      [JSON.stringify(hashedCodes), req.user.sub]
    );

    await recordAuditLog({
      adminEmail: req.user.email,
      action: 'mfa.regenerate_backup_codes',
      targetTable: 'admin_users',
      targetId: req.user.sub,
      oldValue: null,
      newValue: { backup_codes_regenerated: true },
    });

    res.json({
      success: true,
      message: 'New backup codes generated. SAVE THEM NOW — they will not be shown again.',
      backupCodes: plaintextCodes,
    });
  } catch (err) {
    console.error('[adminMfa] Regenerate backup codes error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/mfa/status
 * Check MFA status for the current admin.
 */
router.get('/status', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT mfa_enabled, mfa_enrolled_at FROM admin_users WHERE id = $1',
      [req.user.sub]
    );
    const user = rows[0];
    res.json({
      mfaEnabled: user?.mfa_enabled || false,
      enrolledAt: user?.mfa_enrolled_at || null,
    });
  } catch (err) {
    console.error('[adminMfa] Status error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
