import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import contactRoutes from './routes/contact.js';
import adminRoutes from './routes/admin.js';
import statusRoutes from './routes/status.js';
import { recordRequest } from './stats.js';
import { logger } from './logger.js';
import { initErrorTracking, captureError, sendAlert } from './monitoring.js';
import db from './db.js';
import { config } from './config.js';

initErrorTracking();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const isProduction = config.isProduction;

app.set('trust proxy', 1);

// Real security headers. The admin dashboard is a plain static page with no
// inline scripts/styles, so we can run a real Content-Security-Policy instead
// of disabling it.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        // Admin dashboard now loads Google Fonts to visually match the main
        // site's typography (Inter/Playfair Display/JetBrains Mono) instead
        // of falling back to system fonts - these two directives are the
        // minimum needed to allow that without disabling CSP more broadly.
        styleSrc: ["'self'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    hsts: isProduction ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
  })
);
app.use(
  cors({
    // config.js already refuses to boot in production without CORS_ORIGIN
    // set, so the only case reaching `origin: true` here is local dev.
    origin: config.corsOrigins.length ? config.corsOrigins : true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  })
);
app.use(express.json({ limit: '100kb' }));

// Structured JSON request logging (replaces morgan). In production, this
// stdout stream is exactly what Railway/Render/etc. capture as your logs -
// searchable and filterable in their dashboard with zero extra setup.
app.use(
  pinoHttp({
    logger,
    autoLogging: {
      ignore: (req) => req.url === '/api/health',
    },
    redact: ['req.headers.authorization'],
  })
);

// Real request-timing middleware - powers the public defense-matrix status endpoint
app.use((req, res, next) => {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const end = process.hrtime.bigint();
    const ms = Number(end - start) / 1_000_000;
    recordRequest(ms, res.statusCode >= 500);
  });
  next();
});

// Static admin dashboard (vanilla HTML/JS - no build step needed)
app.use('/admin', express.static(path.join(__dirname, '..', 'public', 'admin')));

// Shallow check: is the process up. Used by uptime pings / load balancers.
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// Deep check: is the process up AND can it actually reach the database.
// Point real uptime monitoring (see backend/README.md) at this one, not /api/health.
app.get('/api/health/deep', (req, res) => {
  try {
    db.prepare('SELECT 1').get();
    res.json({ status: 'ok', database: 'reachable', time: new Date().toISOString() });
  } catch (err) {
    captureError(err, { route: '/api/health/deep' });
    res.status(503).json({ status: 'error', database: 'unreachable' });
  }
});

app.use('/api/contact', contactRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/status', statusRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Not found.' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // Malformed request bodies are a client mistake, not a server incident -
  // return 400 and skip error tracking/alerts so those stay meaningful signal.
  if (err.type === 'entity.parse.failed' || err instanceof SyntaxError) {
    return res.status(400).json({ error: 'Malformed request body.' });
  }

  captureError(err, { method: req.method, url: req.originalUrl });
  sendAlert(
    `🔴 Alux Plaza backend error on ${req.method} ${req.originalUrl}: ${err.message}`,
    `${req.method} ${req.originalUrl}`
  );
  res.status(500).json({ error: 'Something went wrong on our end.' });
});

process.on('unhandledRejection', (err) => {
  captureError(err, { source: 'unhandledRejection' });
  sendAlert(`🔴 Unhandled rejection in Alux Plaza backend: ${err.message}`, 'unhandledRejection');
});

process.on('uncaughtException', (err) => {
  captureError(err, { source: 'uncaughtException' });
  sendAlert(`🔴 Uncaught exception in Alux Plaza backend: ${err.message}`, 'uncaughtException');
  // Let the process exit after logging - an uncaught exception means state may be
  // corrupted. Your host (Railway etc.) will restart it per the restart policy
  // in railway.json.
  process.exit(1);
});

const port = config.port;
app.listen(port, () => {
  logger.info(`Alux Plaza backend listening on http://localhost:${port}`);
  logger.info(`Admin dashboard at http://localhost:${port}/admin`);
});
