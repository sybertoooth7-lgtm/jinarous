// routes/compliance.js
// Client-facing: view their own compliance status, grouped by framework.
// Mount under requireClientAuth so clients only ever see their own data.
import { Router } from 'express';
import db from '../db.js';

const router = Router();

/**
 * GET /api/client/compliance
 * Returns every checklist item alongside this client's status for it
 * (defaulting to 'pending' if no status row exists yet — i.e. not yet assessed).
 */
router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT
         ci.id, ci.framework, ci.item_key, ci.title, ci.description, ci.sort_order,
         COALESCE(ccs.status, 'pending') AS status,
         ccs.notes,
         ccs.updated_at
       FROM compliance_items ci
       LEFT JOIN client_compliance_status ccs
         ON ccs.item_id = ci.id AND ccs.client_id = $1
       ORDER BY ci.framework, ci.sort_order`,
      [req.client.sub]
    );

    // Group by framework for easier frontend rendering.
    const grouped = {};
    for (const row of result.rows) {
      if (!grouped[row.framework]) grouped[row.framework] = [];
      grouped[row.framework].push(row);
    }

    res.json({ frameworks: grouped });
  } catch (err) {
    console.error('[compliance] Failed to fetch client compliance status:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
