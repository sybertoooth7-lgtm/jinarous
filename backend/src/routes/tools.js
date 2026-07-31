// Connects the "Access Control & Authentication Audit" service sold on the
// landing page to something an admin can actually run and see results from,
// instead of the tool being a disconnected CLI script nobody but a
// developer with terminal access could use.
//
// Flow: admin logs into /admin -> Tools tab -> enters a target URL -> this
// endpoint spawns tools/auth_audit.py --json against it -> result is
// persisted to `tool_runs` and returned -> shows up in the report list,
// re-viewable later (e.g. while following up with the lead who requested
// the audit via the contact form).

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { body, param, validationResult } from 'express-validator';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import db from '../db.js';
import { requireAdmin } from '../middleware/auth.js';
import { logger } from '../logger.js';

const router = Router();
router.use(requireAdmin);

// Running an external process per request is meaningfully more expensive
// than a normal API call - a much stricter limiter than the general admin
// API limiter, independent of it.
const toolRunLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many tool runs. Please wait before running another audit.' },
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// tools/ lives at the repo root, two levels up from backend/src/routes/
const toolsDir = path.join(__dirname, '..', '..', '..', 'tools');

const PYTHON_TIMEOUT_MS = 30_000; // hard cap so a hung/slow target can't hang the request forever

const insertRun = db.prepare(`
  INSERT INTO tool_runs (tool, target, status, summary_json, result_json, error, run_by)
  VALUES (@tool, @target, @status, @summaryJson, @resultJson, @error, @runBy)
`);

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
      // Most common real cause: python3 isn't installed/on PATH on this
      // host - a genuinely possible deployment gap, not a code bug, so
      // give a specific, actionable error rather than a generic failure.
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
    const args = [url, '--json', '--attempts', '2']; // low attempt count: keeps this fast enough for a synchronous HTTP request
    if (loginPath) args.push('--login-path', loginPath);
    if (jwt) args.push('--jwt', jwt);

    try {
      const result = await runPythonTool('auth_audit.py', args);

      if (result.error) {
        // Tool ran but reported a structured error (e.g. malformed URL)
        insertRun.run({
          tool: 'auth_audit', target: url, status: 'failed',
          summaryJson: null, resultJson: null, error: result.error, runBy: req.admin?.email || null,
        });
        return res.status(400).json({ error: result.error });
      }

      const dbResult = insertRun.run({
        tool: 'auth_audit',
        target: url,
        status: 'completed',
        summaryJson: JSON.stringify(result.summary),
        resultJson: JSON.stringify(result),
        error: null,
        runBy: req.admin?.email || null,
      });

      return res.status(200).json({ id: dbResult.lastInsertRowid, ...result });
    } catch (err) {
      logger.error({ err, url }, 'auth_audit tool run failed');
      insertRun.run({
        tool: 'auth_audit', target: url, status: 'failed',
        summaryJson: null, resultJson: null, error: err.message, runBy: req.admin?.email || null,
      });
      return res.status(502).json({ error: err.message });
    }
  }
);

router.get('/runs', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const runs = db
    .prepare('SELECT id, tool, target, status, summary_json, error, run_by, created_at FROM tool_runs ORDER BY created_at DESC LIMIT ?')
    .all(limit)
    .map((r) => ({ ...r, summary_json: r.summary_json ? JSON.parse(r.summary_json) : null }));
  return res.json({ runs });
});

router.get(
  '/runs/:id',
  [param('id').isInt().withMessage('Invalid run id.')],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed.', details: errors.array() });
    }
    const run = db.prepare('SELECT * FROM tool_runs WHERE id = ?').get(req.params.id);
    if (!run) return res.status(404).json({ error: 'Run not found.' });
    return res.json({
      ...run,
      summary_json: run.summary_json ? JSON.parse(run.summary_json) : null,
      result_json: run.result_json ? JSON.parse(run.result_json) : null,
    });
  }
);

export default router;
