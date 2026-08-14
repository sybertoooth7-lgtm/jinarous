import express from 'express';
import cors from 'cors';
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
import { limiter, authLimiter, contactLimiter } from './middleware/rate-limit.js';
import { adaptiveLimiter, strictAuthLimiter } from './middleware/adaptiveRateLimit.js';
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
import { attachCspNonce, helmetMiddleware } from './middleware/helmetConfig.js';

async function startServer() {
  const app = express();

  app.set('trust proxy', 1);

  // 1. Helmet + nonce-based CSP
  app.use(attachCspNonce);
  app.use(helmetMiddleware);

  // 2. CORS
  const allowedOrigins = config.corsOrigins?.length > 0
    ? config.corsOrigins
    : ['http://localhost:3000'];

  app.use(cors({
    origin: allowedOrigins,
    credentials: true,
  }));

  // 3. Cookie parser (before CSRF)
  app.use(cookieParser());

  // 4. CSRF cookie
  app.use(setCsrfCookie);

  // 5. Body parsing
  app.use(express.json({ limit: '1mb' }));

  // 6. Shield
  app.use(shield);

  // 7. Metrics
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

  // 8. CSRF verification
  app.use(verifyCsrfToken);

  // Health
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

  // Rate limits
  app.use('/api', adaptiveLimiter);
  app.use('/api/admin/login', strictAuthLimiter);
  app.use('/api/client/login', strictAuthLimiter);
  app.use('/api/contact', contactLimiter);

  // Routes
  app.use('/api/contact', contactRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/status', statusRoutes);
  app.use('/api/admin/tools', toolsRoutes);
  app.use('/api/admin/security', requireAuth, adminSecurityRoutes);
  app.use('/api/client', clientAuthRoutes);
  app.use('/api/client/compliance', requireClientAuth, complianceRoutes);
  app.use('/api/admin/clients', requireAuth, adminClientsRoutes);
  app.use('/admin', express.static('public/admin'));

  // NOTE: adminRiskScoreRoutes must be an Express Router with { mergeParams: true }
  // to access req.params.id defined in this mount path.
  app.use('/api/admin/clients/:id/risk-score-shares', requireAuth, adminRiskScoreRoutes);

  app.use('/api/client/risk-score', requireClientAuth, clientRiskScoreRoutes);
  app.use('/api/verify', verifyScoreRoutes);
  app.use('/api/client/security-events', requireClientAuth, clientSecurityEventsRoutes);

  // Error handler
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

  // Cleanup expired client sessions every 10 minutes
  const sessionCleanupInterval = setInterval(async () => {
    try {
      await db.query('DELETE FROM client_sessions WHERE expires_at < NOW()');
    } catch (err) {
      logger.error({ err }, 'Session cleanup failed');
    }
  }, 10 * 60 * 1000);

  async function shutdown(signal) {
    logger.info(`${signal} received, shutting down gracefully`);
    clearInterval(statsInterval);
    clearInterval(sessionCleanupInterval);
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
