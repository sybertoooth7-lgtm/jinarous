import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { attachCspNonce, helmetMiddleware } from './middleware/helmetConfig.js';
import cluster from 'cluster';
import os from 'os';
import bcrypt from 'bcryptjs';
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
import { shield } from './middleware/shieldMiddleware.js';
import { requireAuth } from './middleware/auth.js';
import adminSecurityRoutes from './routes/adminSecurity.js';
import clientAuthRoutes from './routes/clientAuth.js';
import complianceRoutes from './routes/compliance.js';
import adminClientsRoutes from './routes/adminClients.js';
import { requireClientAuth } from './middleware/clientAuth.js';
import clientRiskScoreRoutes from './routes/clientRiskScore.js';
import adminRiskScoreRoutes from './routes/adminRiskScore.js';
import verifyScoreRoutes from './routes/verifyScore.js';
import clientSecurityEventsRoutes from './routes/clientSecurityEvents.js';
import { setCsrfCookie, verifyCsrfToken } from './middleware/csrf.js';

async function startServer() {
  const app = express();

  // Railway's edge is typically 1 hop and strips/normalizes X-Forwarded-For
  // at their proxy — confirmed via Railway support docs, Aug 2026. If you
  // ever add Cloudflare or another proxy in front of Railway, re-verify and
  // likely bump this to 2.
  app.set('trust proxy', 1);

  // attachCspNonce must run BEFORE helmetMiddleware — helmet's scriptSrc/
  // styleSrc directives read res.locals.cspNonce when building the CSP
  // header for this response, so the nonce has to exist first.
  //
  // Replaces the old inline helmet() config below, which allowed
  // 'unsafe-inline' for styles and had no HSTS. This stricter config lived
  // in helmetConfig.js unused since it was added — checked backend/public/
  // admin/index.html first: no inline <style> tags or style= attributes,
  // and its one script is an external file (dashboard.js), so nonces don't
  // break anything currently served.
  app.use(attachCspNonce);
  app.use(helmetMiddleware);

  const allowedOrigins = config.corsOrigins.length > 0
    ? config.corsOrigins
    : ['http://localhost:3000'];

  app.use(cors({
    origin: allowedOrigins,
    credentials: true,
  }));

  app.use(cookieParser());
  app.use(setCsrfCookie);
  app.use(express.json({ limit: '1mb' }));
  app.use(shield);

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

  app.use(verifyCsrfToken);

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

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
  app.use('/api/client/login', authLimiter);

  app.use('/api/contact', contactRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/status', statusRoutes);
  app.use('/api/admin/tools', toolsRoutes);
  app.use('/api/admin/security', requireAuth, adminSecurityRoutes);
  app.use('/api/client', clientAuthRoutes);
  app.use('/api/client/compliance', requireClientAuth, complianceRoutes);
  app.use('/api/admin/clients', requireAuth, adminClientsRoutes);
  app.use('/admin', express.static('public/admin'));
  app.use('/api/admin/clients/:id/risk-score-shares', requireAuth, adminRiskScoreRoutes);
  app.use('/api/client/risk-score', requireClientAuth, clientRiskScoreRoutes);
  app.use('/api/verify', verifyScoreRoutes);
  app.use('/api/client/security-events', requireClientAuth, clientSecurityEventsRoutes);

  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Malformed request body' });
    }
    captureError(err, { path: req.path, method: req.method });
    sendAlert(
      `Unhandled error on ${req.method} ${req.path}: ${err.message}`,
      `${req.method} ${req.path}`
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
  await initDb();
  initErrorTracking();
  await loadPersistedValues();

  try {
    const { rows } = await db.query('SELECT COUNT(*) AS count FROM admin_users');
    if (parseInt(rows[0].count, 10) === 0) {
      // Hosts without shell access (Render free tier, most PaaS free
      // plans) can't run `npm run create-admin` interactively. These
      // env vars let the very first boot create the initial admin.
      // The branch only ever fires while the table is empty, so the
      // vars become inert after the first login — remove them anyway.
      const bootstrapEmail = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase();
      const bootstrapPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD;

      if (bootstrapEmail && bootstrapPassword) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(bootstrapEmail)) {
          logger.error('ADMIN_BOOTSTRAP_EMAIL is not a valid email address — admin bootstrap skipped.');
        } else if (bootstrapPassword.length < 8) {
          logger.error('ADMIN_BOOTSTRAP_PASSWORD is shorter than 8 characters — admin bootstrap skipped.');
        } else {
          const hash = await bcrypt.hash(bootstrapPassword, 12);
          await db.query(
            'INSERT INTO admin_users (email, password_hash) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING',
            [bootstrapEmail, hash]
          );
          logger.warn(`Bootstrapped initial admin account: ${bootstrapEmail}`);
          logger.warn('Remove ADMIN_BOOTSTRAP_EMAIL and ADMIN_BOOTSTRAP_PASSWORD from the host env vars now.');
        }
      } else {
        logger.warn('No admin users exist yet. Run `npm run create-admin` once, or set ADMIN_BOOTSTRAP_EMAIL + ADMIN_BOOTSTRAP_PASSWORD to create the first admin automatically on boot.');
      }
    } else if (process.env.ADMIN_BOOTSTRAP_EMAIL || process.env.ADMIN_BOOTSTRAP_PASSWORD) {
      // Admin(s) already exist, so these vars have no further effect on
      // this boot — but leaving them set means anyone with read access to
      // your host's env vars (Railway dashboard, a leaked env dump, a
      // screen share) has a working admin email + plaintext password they
      // can try directly against /api/admin/login, independent of whether
      // this bootstrap branch ever runs again. Refuse to boot in
      // production until both are removed, so this can't be silently
      // forgotten past a warning log that scrolls out of view.
      const message =
        'ADMIN_BOOTSTRAP_EMAIL/ADMIN_BOOTSTRAP_PASSWORD are still set but an admin account already exists. Remove both from your host env vars and redeploy.';
      if (config.isProduction) {
        logger.error(message);
        process.exit(1);
      } else {
        logger.warn(message);
      }
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
