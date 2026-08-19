import { Router } from 'express';
import { spawn } from 'child_process';
import path from 'path';
import dns from 'dns/promises';
import { body, validationResult } from 'express-validator';
import { requireAuth } from '../middleware/auth.js';
import db from '../db.js';

const router = Router();

// Points at the real, existing tools/ directory (auth_audit.py etc.) two
// levels up from backend/src/routes. The previous version of this route
// spawned "scripts/login-tool.js", a script that doesn't exist anywhere in
// the repo — every call would have failed with ENOENT. Requires `python3`
// and the `requests` package on the host running this.
const toolsDir = path.join(import.meta.dirname, '..', '..', '..', 'tools');

// SSRF guard: isURL({require_protocol:true}) alone only confirms the value
// *looks like* a URL — it doesn't stop it from pointing at localhost, an
// internal service, or a cloud metadata endpoint (169.254.169.254). Since
// this route lets an authenticated admin make the SERVER issue an
// outbound HTTP request to an arbitrary address (via auth_audit.py) and
// returns the result, an admin session — including one obtained through
// session hijack, not just a malicious admin — could otherwise be used to
// probe internal-only network segments. Confirmed live in testing:
// target=http://127.0.0.1:<port>/api/admin/me succeeded before this guard
// existed. Resolving DNS ourselves (rather than trusting the hostname)
// also closes the simple version of DNS-rebinding, where a public-looking
// hostname resolves to a private address.
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
    lower === '::1' ||               // loopback
    lower.startsWith('fc') ||        // fc00::/7 unique local
    lower.startsWith('fd') ||        // fc00::/7 unique local
    lower.startsWith('fe8') ||       // fe80::/10 link-local
    lower.startsWith('fe9') ||
    lower.startsWith('fea') ||
    lower.startsWith('feb') ||
    lower.startsWith('::ffff:127.') // IPv4-mapped loopback
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

    const args = [path.join(toolsDir, 'auth_audit.py'), target, '--json'];
    if (loginPath) args.push('--login-path', loginPath);

    const child = spawn('python3', args, { cwd: toolsDir, stdio: ['ignore', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    child.on('error', (err) => {
      console.error('[tools] Failed to start python3:', err.message);
      res.status(500).json({ error: 'Failed to start tool — is python3 installed on this host?' });
    });

    child.on('close', async (code) => {
      if (code !== 0) {
        return res.status(500).json({ error: 'Tool execution failed', stderr: stderr.trim() });
      }
      let result;
      try {
        result = JSON.parse(stdout);
      } catch {
        return res.status(500).json({ error: 'Tool produced invalid output', raw: stdout.trim() });
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
    });
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
