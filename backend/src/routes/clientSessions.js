// backend/src/routes/clientSessions.js
// Client-facing: list and revoke their own active sessions.

import { Router } from 'express';
import db from '../db.js';
import { requireClientAuth } from '../middleware/clientAuth.js';

const router = Router();

/**
 * GET /api/client/sessions
 * List all active sessions for the logged-in client.
 * Excludes the current session's JTI so the user can't accidentally
 * revoke the session they're currently using.
 */
router.get('/', requireClientAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT jti, ip_address, user_agent, expires_at, created_at
       FROM client_sessions
       WHERE client_id = $1 AND expires_at > NOW()
       ORDER BY created_at DESC`,
      [req.client.sub]
    );

    const sessions = rows.map((r) => ({
      jti: r.jti,
      ipAddress: r.ip_address,
      userAgent: r.user_agent,
      expiresAt: r.expires_at,
      createdAt: r.created_at,
      isCurrent: r.jti === req.client.jti,
    }));

    res.json({ sessions });
  } catch (err) {
    console.error('[clientSessions] Failed to list sessions:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/client/sessions/:jti/revoke
 * Revoke a specific session (client can revoke their own).
 */
router.post('/:jti/revoke', requireClientAuth, async (req, res) => {
  const { jti } = req.params;
  // Prevent revoking the current session via this endpoint to avoid
  // accidentally logging the user out while they're using the app.
  // They should use /logout for that.
  if (jti === req.client.jti) {
    return res.status(400).json({ error: 'Use /logout to end your current session.' });
  }

  try {
    const result = await db.query(
      `DELETE FROM client_sessions
       WHERE jti = $1 AND client_id = $2
       RETURNING jti`,
      [jti, req.client.sub]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Session not found or already expired.' });
    }
    // Also blocklist the token so it can't be reused even if cached somewhere
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await db.query(
      `INSERT INTO token_blocklist (jti, expires_at) VALUES ($1, $2)
       ON CONFLICT (jti) DO NOTHING`,
      [jti, expiresAt]
    );
    res.json({ success: true, message: 'Session revoked.' });
  } catch (err) {
    console.error('[clientSessions] Failed to revoke session:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
