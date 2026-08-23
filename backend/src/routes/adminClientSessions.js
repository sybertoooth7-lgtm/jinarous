// Add this to backend/src/routes/adminClients.js (or create adminSessions.js)

import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

/**
 * POST /api/admin/clients/:id/sessions/revoke-all
 * Admin-only: force-logout all sessions for a given client.
 */
router.post('/:id/sessions/revoke-all', requireAuth, async (req, res) => {
  const clientId = req.params.id;
  try {
    // Fetch all active JTIs before deleting, so we can blocklist them
    const { rows } = await db.query(
      `SELECT jti, expires_at FROM client_sessions WHERE client_id = $1 AND expires_at > NOW()`,
      [clientId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'No active sessions found for this client.' });
    }

    // Delete sessions
    await db.query('DELETE FROM client_sessions WHERE client_id = $1', [clientId]);

    // Blocklist all JTIs
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    for (const row of rows) {
      await db.query(
        `INSERT INTO token_blocklist (jti, expires_at) VALUES ($1, $2)
         ON CONFLICT (jti) DO NOTHING`,
        [row.jti, expiresAt]
      );
    }

    res.json({ success: true, revokedCount: rows.length });
  } catch (err) {
    console.error('[clientSessions] Admin revoke-all failed:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
