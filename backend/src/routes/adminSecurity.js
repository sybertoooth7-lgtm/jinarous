// routes/adminSecurity.js
// Mount this under your existing admin auth middleware — same pattern
// you're presumably already using to protect other admin routes.
//
// Usage in your main app file:
//   import adminSecurityRoutes from './routes/adminSecurity.js';
//   app.use('/admin/security', requireAdminAuth, adminSecurityRoutes);

import { Router } from 'express';
import { listActiveBlocks, unblockIp } from '../shield/blocklist.js';
import db from '../db.js';
import { recordAuditLog } from '../middleware/auditLog.js';

const router = Router();

/**
 * GET /admin/security/blocks
 * Lists all currently active (non-expired) IP blocks.
 */
router.get('/blocks', async (req, res) => {
  try {
    const blocks = await listActiveBlocks();
    res.json({ count: blocks.length, blocks });
  } catch (err) {
    console.error('[admin/security] failed to list blocks:', err.message);
    res.status(500).json({ error: 'Failed to fetch blocks.' });
  }
});

/**
 * POST /admin/security/blocks/:ip/unblock
 * Manually unblocks an IP — use this to clear a false positive.
 */
router.post('/blocks/:ip/unblock', async (req, res) => {
  try {
    await unblockIp(req.params.ip);
    await recordAuditLog({
      adminEmail: req.user?.email || 'unknown',
      action: 'ip.unblock',
      targetTable: 'blocked_ips',
      targetId: req.params.ip,
      oldValue: { blocked: true },
      newValue: { blocked: false },
    });
    res.json({ success: true, message: `${req.params.ip} unblocked.` });
  } catch (err) {
    console.error('[admin/security] failed to unblock:', err.message);
    res.status(500).json({ error: 'Failed to unblock IP.' });
  }
});

/**
 * GET /admin/security/events?limit=50&type=sqli
 * Recent security events (detections + blocks), most recent first.
 * Useful for reviewing what tripped a block before deciding to unblock.
 */
router.get('/events', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  const type = req.query.type || null;

  try {
    const result = type
      ? await db.query(
          `SELECT * FROM security_events WHERE event_type = $1
           ORDER BY created_at DESC LIMIT $2`,
          [type, limit]
        )
      : await db.query(
          `SELECT * FROM security_events ORDER BY created_at DESC LIMIT $1`,
          [limit]
        );
    res.json({ count: result.rows.length, events: result.rows });
  } catch (err) {
    console.error('[admin/security] failed to fetch events:', err.message);
    res.status(500).json({ error: 'Failed to fetch events.' });
  }
});

export default router;
