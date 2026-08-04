import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { body, param, validationResult } from 'express-validator';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import db from '../db.js';
import { requireAdmin } from '../middleware/auth.js';
import { logger } from '../logger.js';
import { PostgresRateLimitStore } from '../lib/rate-limit-store.js';

const router = Router();
router.use(requireAdmin);

const toolRunLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many tool runs. Please wait before running another audit.' },
  store: new PostgresRateLimitStore(15 * 60 * 1000),
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const toolsDir = path.join(__dirname, '..', '..', '..', 'tools');

const PYTHON_TIMEOUT_MS = 30_000;

async function insertRun({ tool, target, status, summaryJson, resultJson, error, runBy }) {
  const result = await db.query(
    `INSERT INTO tool_runs (tool, target, status, summary_json, result_json, error, run_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [tool, target, status, summaryJson, resultJson, error, runBy]
  );
  return result.rows[0];
}

function runPythonTool(scriptName, args) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(toolsDir, scriptName);
    const proc = spawn('python3', [scriptPath, ...args], { cwd: toolsDir });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error(`Tool timed out after ${PYTHON_TIMEOUT_MS / 1000}s.`));
    }, PYTHON_TIMEOUT_MS);

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`Could not start ${scriptName}: ${err.message}. Is python3 installed on this host?`));
    });

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0 && !stdout.trim()) {
        reject(new Error(stderr.trim() || `${scriptName} exited with code ${code} and no output.`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout);
        resolve(parsed);
      } catch {
        reject(new Error(`Could not parse tool output as JSON: ${stdout.slice(0, 300)}`));
      }
    });
  });
}

router.post(
  '/auth-audit',
  toolRunLimiter,
  [
    body('url').trim().isURL({ require_protocol: true }).withMessage('A valid URL including http:// or https:// is required.'),
    body('loginPath').optional({ checkFalsy: true }).trim().isString(),
    body('jwt').optional({ checkFalsy: true }).trim().isString(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed.', details: errors.array() });
    }

    const { url, loginPath, jwt } = req.body;
    const args = [url, '--json', '--attempts', '2'];
    if (loginPath) args.push('--login-path', loginPath);
    if (jwt) args.push('--jwt', jwt);

    try {
      const result = await runPythonTool('auth_audit.py', args);

      if (result.error) {
        await insertRun({
          tool: 'auth_audit', target: url, status: 'failed',
          summaryJson: null, resultJson: null, error: result.error, runBy: req.user?.email || null,
        });
        return res.status(400).json({ error: result.error });
      }

      const dbResult = await insertRun({
        tool: 'auth_audit',
        target: url,
        status: 'completed',
        summaryJson: JSON.stringify(result.summary),
        resultJson: JSON.stringify(result),
        error: null,
        runBy: req.user?.email || null,
      });

      return res.status(200).json({ id: dbResult.id, ...result });
    } catch (err) {
      logger.error({ err, url }, 'auth_audit tool run failed');
      await insertRun({
        tool: 'auth_audit', target: url, status: 'failed',
        summaryJson: null, resultJson: null, error: err.message, runBy: req.user?.email || null,
      });
      return res.status(502).json({ error: err.message });
    }
  }
);

router.get('/runs', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const result = await db.query(
    `SELECT id, tool, target, status, summary_json, error, run_by, created_at
     FROM tool_runs ORDER BY created_at DESC LIMIT $1`,
    [limit]
  );
  const runs = result.rows.map((r) => ({
    ...r,
    summary_json: r.summary_json ? JSON.parse(r.summary_json) : null,
  }));
  return res.json({ runs });
});

router.get(
  '/runs/:id',
  [param('id').isInt().withMessage('Invalid run id.')],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed.', details: errors.array() });
    }
    const result = await db.query('SELECT * FROM tool_runs WHERE id = $1', [req.params.id]);
    const run = result.rows[0];
    if (!run) return res.status(404).json({ error: 'Run not found.' });
    return res.json({
      ...run,
      summary_json: run.summary_json ? JSON.parse(run.summary_json) : null,
      result_json: run.result_json ? JSON.parse(run.result_json) : null,
    });
  }
);

export default router;
