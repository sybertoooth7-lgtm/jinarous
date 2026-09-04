// routes/adminSecurity.js
// Mount this under your existing admin auth middleware — same pattern
// you're presumably already using to protect other admin routes.
//
// Usage in your main app file:
//   import adminSecurityRoutes from './routes/adminSecurity.js';
//   app.use('/admin/security', requireAdminAuth, adminSecurityRoutes);

import { Router } from 'express';
import { listActiveBlocks, countActiveBlocks, unblockIp } from '../shield/blocklist.js';
import db from '../db.js';
import { recordAuditLog } from '../middleware/auditLog.js';

const router = Router();

/**
 * GET /admin/security/blocks?page=1&limit=50
 * Lists all currently active (non-expired) IP blocks.
 */
router.get('/blocks', async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
  const offset = (page - 1) * limit;

  try {
    const total = await countActiveBlocks();
    const blocks = await listActiveBlocks(limit, offset);
    res.json({
      blocks,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
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
 * GET /admin/security/events?page=1&limit=50&type=sqli
 * Recent security events (detections + blocks), most recent first.
 * Useful for reviewing what tripped a block before deciding to unblock.
 */
router.get('/events', async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
  const offset = (page - 1) * limit;
  const type = req.query.type || null;

  try {
    const whereClause = type ? 'WHERE event_type = $1' : '';
    const countParams = type ? [type] : [];
    const countResult = await db.query(
      `SELECT COUNT(*) FROM security_events ${whereClause}`,
      countParams
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const dataParams = type ? [type, limit, offset] : [limit, offset];
    const limitPlaceholder = type ? '$2' : '$1';
    const offsetPlaceholder = type ? '$3' : '$2';
    const result = await db.query(
      `SELECT * FROM security_events ${whereClause}
       ORDER BY created_at DESC LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
      dataParams
    );
    res.json({
      events: result.rows,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error('[admin/security] failed to fetch events:', err.message);
    res.status(500).json({ error: 'Failed to fetch events.' });
  }
});

export default router;
