import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cluster from 'node:cluster';
import os from 'node:os';

import contactRoutes from './routes/contact.js';
import adminRoutes from './routes/admin.js';
import toolsRoutes from './routes/tools.js';
import statusRoutes from './routes/status.js';
import { recordRequest, persistStats } from './stats.js';
import { logger } from './logger.js';
import { initErrorTracking, captureError, sendAlert } from './monitoring.js';
import db from './db.js';
import { config } from './config.js';

const SHUTDOWN_TIMEOUT_MS = 10000;

function startServer() {
  initErrorTracking();

  const adminCount = db.prepare('SELECT COUNT(*) AS c FROM admin_users').get().c;
  if (adminCount === 0) {
    logger.warn(
      'No admin users exist yet — /admin has no login. Run `npm run create-admin` once.'
    );
  }

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const app = express();
  const isProduction = config.isProduction;

  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      hsts: isProduction
        ? { maxAge: 31536000, includeSubDomains: true, preload: true }
        : false,
    })
  );

  app.use(
    cors({
      origin: config.corsOrigins.length ? config.corsOrigins : true,
      methods: ['GET', 'POST'],
      credentials: true,
    })
  );

  app.use(express.json({ limit: '100kb' }));

  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.url === '/api/health' },
      redact: ['req.headers.authorization'],
    })
  );

  // Request timing for Defense Matrix
  app.use((req, res, next) => {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - start) / 1_000_000;
      recordRequest(ms, res.statusCode >= 500);
    });
    next();
  });

  // Admin dashboard — still static, but now served with a warning
  // TODO: move this behind auth middleware if you expose it publicly
  app.use('/admin', express.static(path.join(__dirname, './', 'public', 'admin')));

  // Shallow health check
  app.get('/api/health', (req, res) =>
    res.json({ status: 'ok', time: new Date().toISOString() })
  );

  // Deep health check with 5-second DB timeout
  app.get('/api/health/deep', async (req, res) => {
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('DB timeout')), 5000)
    );
    try {
      await Promise.race([
        new Promise((resolve, reject) => {
          try {
            db.prepare('SELECT 1').get();
            resolve();
          } catch (e) {
            reject(e);
          }
        }),
        timeout,
      ]);
      res.json({ status: 'ok', database: 'reachable', time: new Date().toISOString() });
    } catch (err) {
      captureError(err, { route: '/api/health/deep' });
      res.status(503).json({ status: 'error', database: 'unreachable' });
    }
  });

  app.use('/api/contact', contactRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/admin/tools', toolsRoutes);
  app.use('/api/status', statusRoutes);

  app.use((req, res) => res.status(404).json({ error: 'Not found.' }));

  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed' || err instanceof SyntaxError) {
      return res.status(400).json({ error: 'Malformed request body.' });
    }
    captureError(err, { method: req.method, url: req.originalUrl });
    sendAlert(
      `🔴 Error on ${req.method} ${req.originalUrl}: ${err.message}`,
      `${req.method} ${req.originalUrl}`
    );
    res.status(500).json({ error: 'Something went wrong on our end.' });
  });

  const server = app.listen(config.port, () => {
    logger.info(`Alux Plaza backend listening on port ${config.port}`);
  });

  // --- Graceful shutdown (FIXED) ---
  let isShuttingDown = false;

  function gracefulShutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.info(`${signal} received, closing server gracefully...`);

    const forceExit = setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);

    try {
      persistStats();
    } catch (e) {
      logger.error('Stats flush failed during shutdown:', e);
    }

    server.close((err) => {
      clearTimeout(forceExit);
      if (err) {
        logger.error('Server close error:', err);
        process.exit(1);
      }
      logger.info('Server gracefully shut down');
      process.exit(0);
    });
  }

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGHUP', () => gracefulShutdown('SIGHUP'));

  process.on('unhandledRejection', (err) => {
    captureError(err, { source: 'unhandledRejection' });
    sendAlert(`🔴 Unhandled rejection: ${err.message}`, 'unhandledRejection');
  });

  process.on('uncaughtException', (err) => {
    captureError(err, { source: 'uncaughtException' });
    sendAlert(`🔴 Uncaught exception: ${err.message}`, 'uncaughtException');
    logger.error('Uncaught exception — initiating graceful shutdown...');
    gracefulShutdown('uncaughtException');
  });

  return server;
}

// --- Cluster mode for production (uses all CPU cores) ---
if (config.isProduction && process.env.CLUSTER_MODE === 'true') {
  if (cluster.isPrimary) {
    const workers = os.availableParallelism ? os.availableParallelism() : os.cpus().length;
    logger.info(`Primary ${process.pid} spawning ${workers} workers`);
    for (let i = 0; i < workers; i++) cluster.fork();
    cluster.on('exit', (worker, code, signal) => {
      logger.warn(`Worker ${worker.process.pid} died. Restarting...`);
      cluster.fork();
    });
  } else {
    startServer();
  }
} else {
  startServer();
}
