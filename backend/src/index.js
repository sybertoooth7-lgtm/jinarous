import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import cluster from 'cluster';
import os from 'os';
import pinoHttp from 'pino-http';
import { config } from './config.js';
import db, { initDb } from './db.js';
import { logger } from './logger.js';
import { initErrorTracking, captureError, sendAlert } from './monitoring.js';
import { recordRequest, loadPersistedValues, persistStats } from './stats.js';
import contactRoutes from './routes/contact.js';
import adminRoutes from './routes/admin.js';
import statusRoutes from './routes/status.js';
import toolsRoutes from './routes/tools.js';
import { limiter, authLimiter } from './middleware/rate-limit.js';

async function startServer() {
  const app = express();

  // Railway, Vercel, and virtually every PaaS put the app behind one
  // reverse-proxy hop. Without this, req.ip (and X-Forwarded-For) reflects
  // the proxy's IP for every single visitor, not the real client's — which
  // silently breaks IP-based rate limiting (everyone gets bucketed
  // together under one "IP") the moment this actually deploys. `1` means
  // "trust exactly one hop in front of us," which matches how these
  // platforms are set up. Using `true` instead would trust every hop in
  // an arbitrarily long chain, which is a spoofing risk if any hop before
  // the real proxy is attacker-influenced — only trust as many hops as
  // you actually know exist.
  app.set('trust proxy', 1);

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
  }));

  // config.corsOrigins is already a parsed, trimmed array from config.js —
  // a previous version of this file tried to read config.corsOrigin
  // (singular, a field that doesn't exist) and always silently fell back
  // to localhost regardless of what CORS_ORIGIN was actually set to.
  const allowedOrigins = config.corsOrigins.length > 0
    ? config.corsOrigins
    : ['http://localhost:3000'];

  app.use(cors({
    origin: allowedOrigins,
    credentials: true,
  }));

  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));

  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const latencyMs = Date.now() - start;
      const isError = res.statusCode >= 500;
      recordRequest(latencyMs, isError);
    });
    next();
  });

  app.use(pinoHttp({
    logger,
    autoLogging: {
      ignore: (req) => req.url === '/api/health',
    },
  }));

  // Shallow — just confirms the process is up and answering HTTP requests.
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Deep — actually queries the database. Point real uptime monitoring at
  // this one; the shallow check above returns 200 even if the DB is down.
  app.get('/api/health/deep', async (req, res) => {
    try {
      await db.query('SELECT 1');
      res.json({ status: 'ok', database: 'connected' });
    } catch (err) {
      res.status(503).json({ status: 'error', database: 'unreachable' });
    }
  });

  app.use('/api', limiter);
  app.use('/api/admin/login', authLimiter);
  app.use('/api/contact', contactRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/status', statusRoutes);
  app.use('/api/admin/tools', toolsRoutes);
  app.use('/admin', express.static('public/admin'));

  // Catch malformed request bodies as a plain 400 — not a 500, and not
  // reported to error tracking. A client sending broken JSON isn't a
  // server error, and treating it as one pollutes real error signal.
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Malformed request body' });
    }
    captureError(err, { path: req.path, method: req.method });
    sendAlert(
      `Unhandled error on ${req.method} ${req.path}: ${err.message}`,
      `${req.method} ${req.path}` // throttle key: bounded by route count, not by err.message
    ).catch(() => {});
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  const server = app.listen(config.port, () => {
    logger.info(`Backend listening on port ${config.port}`);
  });

  const statsInterval = setInterval(persistStats, 10_000);

  async function shutdown(signal) {
    logger.info(`${signal} received, shutting down gracefully`);
    clearInterval(statsInterval);
    await persistStats();
    server.close(async () => {
      await db.end().catch(() => {});
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

async function main() {
  // config.js already prints its own warnings/errors as a side effect of
  // being imported (and exits the process for hard errors), so there's
  // nothing more to do with them here.
  await initDb();
  initErrorTracking();
  await loadPersistedValues();

  try {
    const { rows } = await db.query('SELECT COUNT(*) AS count FROM admin_users');
    if (parseInt(rows[0].count, 10) === 0) {
      logger.warn('No admin users exist yet. Run `npm run create-admin` once.');
    }
  } catch (err) {
    logger.error(`Failed to check for admin users: ${err.message}`);
  }

  await startServer();
}

const clusterModeEnabled = process.env.CLUSTER_MODE === 'true';

if (clusterModeEnabled && cluster.isPrimary) {
  const numCPUs = os.cpus().length;
  logger.info(`Cluster mode: forking ${numCPUs} workers`);
  for (let i = 0; i < numCPUs; i++) cluster.fork();
  cluster.on('exit', (worker) => {
    logger.warn(`Worker ${worker.process.pid} died, forking a replacement`);
    cluster.fork();
  });
} else {
  main().catch((err) => {
    console.error('[index] FATAL: failed to start server:', err);
    process.exit(1);
  });
}
