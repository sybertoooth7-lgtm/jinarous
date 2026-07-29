/**
 * honeypot.js
 * --------------------------------------------------------------
 * A real, working honeypot / intrusion-attempt monitor for Express apps.
 * Backs the "Honeypot & Intrusion-Attempt Monitoring" service
 * (formerly "Neural Deception" on the Alux Plaza site).
 *
 * WHAT THIS ACTUALLY DOES (no simulated data):
 *   - Registers a set of decoy routes that no legitimate user or
 *     script should ever request (fake admin panels, fake .env,
 *     fake API keys file, common attacker scan targets).
 *   - Any request to a decoy route is logged with real data:
 *     timestamp, IP, method, path, user-agent, and headers.
 *   - Optionally fires a webhook (e.g. Slack/Discord) the moment
 *     a decoy is touched, so you get a real-time alert.
 *   - Ships with a companion report.js to summarize the log file.
 *
 * This is a genuine, widely-used security technique (canary /
 * honeypot routes) - not AI, not fictional. It works because a
 * decoy endpoint should NEVER receive real traffic; any hit on it
 * is a strong signal of scanning, probing, or an attack attempt.
 *
 * USAGE (in your existing Express app):
 *
 *   const { attachHoneypot } = require('./honeypot');
 *   attachHoneypot(app, {
 *     logPath: './data/honeypot-log.jsonl',
 *     webhookUrl: process.env.HONEYPOT_WEBHOOK_URL, // optional
 *   });
 *
 * Mount this AFTER your real routes so decoys don't shadow them,
 * but BEFORE your final 404 handler.
 */

const fs = require('fs');
const path = require('path');

// Common paths real attackers/scanners probe for. Extend freely -
// the more decoys, the more signal, as long as none collide with
// your real routes.
const DEFAULT_DECOY_PATHS = [
  '/wp-admin',
  '/wp-login.php',
  '/admin',
  '/administrator',
  '/.env',
  '/.env.local',
  '/.git/config',
  '/config.php',
  '/phpmyadmin',
  '/api/v1/users',
  '/api/admin',
  '/backup.sql',
  '/.aws/credentials',
  '/server-status',
  '/actuator/health',
  '/xmlrpc.php',
];

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function logHit(logPath, entry) {
  ensureDir(logPath);
  fs.appendFile(logPath, JSON.stringify(entry) + '\n', (err) => {
    if (err) console.error('[honeypot] failed to write log:', err.message);
  });
}

async function fireWebhook(webhookUrl, entry) {
  if (!webhookUrl) return;
  try {
    const body = {
      text: `🍯 Honeypot triggered: ${entry.method} ${entry.path} from ${entry.ip} (UA: ${entry.userAgent})`,
    };
    // Node 18+ has global fetch. Falls back silently if unavailable.
    if (typeof fetch === 'function') {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    }
  } catch (err) {
    console.error('[honeypot] webhook failed:', err.message);
  }
}

/**
 * Attach honeypot decoy routes + logging middleware to an Express app.
 *
 * @param {import('express').Express} app
 * @param {object} options
 * @param {string} [options.logPath] - where to write JSONL hit log
 * @param {string[]} [options.extraPaths] - additional decoy paths
 * @param {string} [options.webhookUrl] - optional webhook for real-time alerts
 */
function attachHoneypot(app, options = {}) {
  const logPath = options.logPath || path.join(process.cwd(), 'data', 'honeypot-log.jsonl');
  const decoyPaths = [...DEFAULT_DECOY_PATHS, ...(options.extraPaths || [])];

  const handler = (req, res) => {
    const entry = {
      timestamp: new Date().toISOString(),
      ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
      method: req.method,
      path: req.originalUrl,
      userAgent: req.headers['user-agent'] || 'unknown',
      referer: req.headers['referer'] || null,
    };

    logHit(logPath, entry);
    fireWebhook(options.webhookUrl, entry);

    // Respond like a real 404 - don't tip off the attacker that this
    // is a monitored decoy.
    res.status(404).send('Not Found');
  };

  for (const decoyPath of decoyPaths) {
    app.all(decoyPath, handler);
  }

  console.log(`[honeypot] ${decoyPaths.length} decoy routes armed. Logging to ${logPath}`);
}

module.exports = { attachHoneypot, DEFAULT_DECOY_PATHS };
