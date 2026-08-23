import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { requireAuth } from '../middleware/auth.js';
import { runAuthAudit } from '../lib/authAudit.js';
import db from '../db.js';

const router = Router();

router.post(
  '/run',
  requireAuth,
  [
    body('target')
      .trim()
      .isURL({ require_protocol: true })
      .withMessage('Target must be a full URL including https://'),
    body('loginPath')
      .optional({ checkFalsy: true })
      .trim()
      .matches(/^[a-zA-Z0-9_\-\/.]*$/)
      .withMessage('Invalid login path.'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { target, loginPath } = req.body;

    try {
      const result = await runAuthAudit(target, loginPath);

      try {
        await db.query(
          `INSERT INTO tool_runs (tool, target, status, summary_json, result_json, run_by, created_at)
           VALUES ($1, $2, 'completed', $3, $4, $5, NOW())`,
          [
            'auth_audit',
            target,
            JSON.stringify(result.summary || {}),
            JSON.stringify(result),
            req.user?.email || null,
          ]
        );
      } catch (err) {
        console.error('[tools] Failed to record run:', err.message);
      }

      res.json({ success: true, result });
    } catch (err) {
      console.error('[tools] Audit error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

router.get('/runs', requireAuth, async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100);
  try {
    const { rows } = await db.query(
      `SELECT id, tool, target, status, summary_json, run_by, created_at
       FROM tool_runs ORDER BY created_at DESC LIMIT $1`,
      [limit]
    );
    res.json({ runs: rows });
  } catch (err) {
    console.error('[tools] Failed to list runs:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/runs/:id', requireAuth, async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) {
    return res.status(400).json({ error: 'Invalid run id.' });
  }
  try {
    const { rows } = await db.query('SELECT * FROM tool_runs WHERE id = $1', [req.params.id]);
    if (!rows[0]) {
      return res.status(404).json({ error: 'Run not found.' });
    }
    res.json({ run: rows[0] });
  } catch (err) {
    console.error('[tools] Failed to fetch run:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
