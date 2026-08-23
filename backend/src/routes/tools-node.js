// backend/src/routes/tools.js
// Pure Node.js tools route — no Python subprocess.
// Replaces the old child_process.spawn('python3', ...) version.

import { Router } from 'express';
import dns from 'dns/promises';
import { body, validationResult } from 'express-validator';
import { requireAuth } from '../middleware/auth.js';
import db from '../db.js';
import { audit } from '../lib/authAudit.js';

const router = Router();

// SSRF guard: same ranges as before — prevents probing internal networks
// via the server-side fetch.
const BLOCKED_IPV4_RANGES = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24],
  ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4],
];

function ipv4ToInt(ip) {
  return ip.split('.').reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

function isBlockedIPv4(ip) {
  const target = ipv4ToInt(ip);
  return BLOCKED_IPV4_RANGES.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (target & mask) === (ipv4ToInt(base) & mask);
  });
}

function isBlockedIPv6(ip) {
  const lower = ip.toLowerCase();
  return (
    lower === '::1' ||
    lower.startsWith('fc') ||
    lower.startsWith('fd') ||
    lower.startsWith('fe8') ||
    lower.startsWith('fe9') ||
    lower.startsWith('fea') ||
    lower.startsWith('feb') ||
    lower.startsWith('::ffff:127.')
  );
}

async function assertPublicTarget(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('Target is not a valid URL.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Target must use http:// or https://.');
  }

  let addresses;
  try {
    addresses = await dns.lookup(url.hostname, { all: true, verbatim: true });
  } catch {
    throw new Error('Target hostname could not be resolved.');
  }
  for (const { address, family } of addresses) {
    if (family === 4 && isBlockedIPv4(address)) {
      throw new Error('Target resolves to a private or internal address — not allowed.');
    }
    if (family === 6 && isBlockedIPv6(address)) {
      throw new Error('Target resolves to a private or internal address — not allowed.');
    }
  }
}

router.post(
  '/run',
  requireAuth,
  [
    body('target').trim().isURL({ require_protocol: true }).withMessage('Target must be a full URL including https://'),
    body('loginPath').optional({ checkFalsy: true }).trim().matches(/^\/[a-zA-Z0-9_\-/.]*$/).withMessage('Invalid login path.'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { target, loginPath } = req.body;

    try {
      await assertPublicTarget(target);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    let result;
    try {
      result = await audit(target, loginPath);
    } catch (err) {
      console.error('[tools] Audit failed:', err.message);
      return res.status(500).json({ error: 'Audit execution failed', detail: err.message });
    }

    if (result.error) {
      return res.status(500).json({ error: result.error });
    }

    try {
      await db.query(
        `INSERT INTO tool_runs (tool, target, status, summary_json, result_json, run_by, created_at)
         VALUES ($1, $2, 'completed', $3, $4, $5, NOW())`,
        ['auth_audit', target, JSON.stringify(result.summary || {}), JSON.stringify(result), req.user?.email || null]
      );
    } catch (err) {
      console.error('[tools] Failed to record run:', err.message);
    }

    res.json({ success: true, result });
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
