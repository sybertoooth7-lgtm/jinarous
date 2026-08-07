import { Router } from 'express';
import { spawn } from 'child_process';
import path from 'path';
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

export default router;
