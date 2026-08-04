const express = require('express');
const { spawn } = require('child_process');
const { body, validationResult } = require('express-validator');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Negative lookahead rejects any string containing '..'
const SAFE_PATH_REGEX = /^(?!.*\.\.)[a-zA-Z0-9_\-\/\.]+$/;

router.post('/run', requireAuth, [
  body('loginPath')
    .trim()
    .notEmpty()
    .matches(SAFE_PATH_REGEX)
    .withMessage('Invalid path format. Path traversal (..) and special characters are not allowed.')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { loginPath } = req.body;

  try {
    const child = spawn('node', ['scripts/login-tool.js', loginPath], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });

    child.on('close', (code) => {
      if (code !== 0) {
        return res.status(500).json({
          error: 'Tool execution failed',
          stderr: stderr.trim()
        });
      }
      res.json({ success: true, output: stdout.trim() });
    });

    child.on('error', (err) => {
      console.error('Spawn error:', err);
      res.status(500).json({ error: 'Failed to start tool' });
    });
  } catch (err) {
    console.error('Tools route error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
