// backend/src/index.js
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import slowDown from 'express-slow-down';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { config } from './config.js';
import db from './db.js';
import { logger } from './logger.js';
import { pinoHttpMiddleware } from './middleware/pinoHttp.js';
import { shield } from './middleware/shieldMiddleware.js';
import { attachCspNonce, helmetMiddleware } from './middleware/helmetConfig.js';
import { PostgresRateLimitStore } from './lib/rate-limit-store.js';
import { blocklistToken, requireAuth } from './middleware/auth.js';
import { requireClientAuth } from './middleware/clientAuth.js';          // FIX C1: was missing
import { setCsrfCookie, verifyCsrfToken } from './middleware/csrf.js';
import { configureTrustProxy } from './config/trusted-proxies.js';
import { startCleanupScheduler } from './jobs/cleanup.js';

import adminRoutes from './routes/admin.js';
import clientAuthRoutes from './routes/clientAuth.js';
import complianceRoutes from './routes/compliance.js';
import contactRoutes from './routes/contact.js';
import statusRoutes from './routes/status.js';
import toolsRoutes from './routes/tools.js';
import adminClientsRoutes from './routes/adminClients.js';
import adminSecurityRoutes from './routes/adminSecurity.js';
import adminRiskScoreRoutes from './routes/adminRiskScore.js';
import clientRiskScoreRoutes from './routes/clientRiskScore.js';
import verifyScoreRoutes from './routes/verifyScore.js';
import clientSecurityEventsRoutes from './routes/clientSecurityEvents.js';
import clientSessionRoutes from './routes/clientSessions.js';
import adminMfaRoutes from './routes/adminMfa.js';
import adminUsersRoutes from './routes/adminUsers.js';
import healthRoutes from './routes/health.js';
import { verifyLimiter } from './middleware/verify-rate-limit.js';

import { requireAdmin, requireSuperAdmin } from './middleware/rbac.js';

import { recordAuditLog } from './middleware/auditLog.js';
import { stats, persistStats } from './stats.js';

async function startServer() {
  const app = express();

  configureTrustProxy(app);

  app.use(pinoHttpMiddleware);

  // FIX C3: config.corsOrigin -> config.corsOrigins (matches config.js export)
  app.use(cors({ origin: config.corsOrigins, credentials: true }));
  app.use(attachCspNonce);
  app.use(helmetMiddleware);
  app.use(express.json({ limit: '10kb' }));
  app.use(express.urlencoded({ extended: false, limit: '10kb' }));
  // FIX C4: config.cookieSecret is now exported from config.js
  app.use(cookieParser(config.cookieSecret));
  app.use(setCsrfCookie);

  app.use(shield);

  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    store: new PostgresRateLimitStore(),
    keyGenerator: (req) => ipKeyGenerator(req.ip),
    handler: (req, res) => {
      res.status(429).json({ error: 'Too many requests, please try again later.', retryAfter: 15 * 60 });
    },
  });

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    store: new PostgresRateLimitStore(),
    keyGenerator: (req) => `login:${ipKeyGenerator(req.ip)}`,
    handler: (req, res) => {
      res.status(429).json({ error: 'Too many login attempts, please try again later.', retryAfter: 15 * 60 });
    },
  });

  // FIX C2: removed invalid `app.use(loginAudit);` — loginAudit.js exports
  // logLoginAttempt/isNewIp/alertNewDevice, not a middleware function.
  app.use(verifyCsrfToken);

  app.use('/api', healthRoutes);
  app.use('/api', limiter);
  app.use('/api/admin/login', authLimiter);
  app.use('/api/client/login', authLimiter);

  // Public / readonly-safe admin routes
  app.use('/api/admin', adminRoutes);
  // FIX M3: removed redundant requireAuth — adminMfaRoutes already has it internally
  app.use('/api/admin/mfa', adminMfaRoutes);

  // Admin-only routes (readonly blocked)
  app.use('/api/admin/security', requireAuth, requireAdmin, adminSecurityRoutes);
  app.use('/api/admin/clients', requireAuth, requireAdmin, adminClientsRoutes);
  app.use('/api/admin/clients/:id/risk-score-shares', requireAuth, requireAdmin, adminRiskScoreRoutes);
  app.use('/api/admin/tools', requireAuth, requireAdmin, toolsRoutes);

  // Superadmin-only routes
  app.use('/api/admin/users', requireAuth, requireSuperAdmin, adminUsersRoutes);

  // Client routes
  app.use('/api/client', clientAuthRoutes);
  app.use('/api/client/compliance', requireClientAuth, complianceRoutes);
  app.use('/api/client/risk-score', requireClientAuth, clientRiskScoreRoutes);
  app.use('/api/client/security-events', requireClientAuth, clientSecurityEventsRoutes);
  app.use('/api/client/sessions', requireClientAuth, clientSessionRoutes);

  // Public routes
  app.use('/api/contact', contactRoutes);
  app.use('/api/status', statusRoutes);
  app.use('/api/verify', verifyLimiter);
  app.use('/api/verify', verifyScoreRoutes);
  app.use('/admin', express.static('public/admin'));

  app.use((err, req, res, next) => {
    logger.error(err);
    const status = err.status || 500;
    const message = config.isProduction
      ? 'Internal Server Error'
      : (err.message || 'Internal Server Error');
    res.status(status).json({ error: message });
  });

  // Create default admin if none exists
  try {
    const adminResult = await db.query('SELECT id FROM admin_users LIMIT 1');
    if (adminResult.rows.length === 0) {
      const bootstrapEmail = config.adminBootstrapEmail;
      const bootstrapPassword = config.adminBootstrapPassword;
      if (bootstrapEmail && bootstrapPassword) {
        const hashedPassword = await bcrypt.hash(bootstrapPassword, 12);
        await db.query(
          'INSERT INTO admin_users (email, password_hash, role) VALUES ($1, $2, $3) ON CONFLICT (email) DO NOTHING',
          [bootstrapEmail, hashedPassword, 'superadmin']
        );
        logger.info(`Default admin created: ${bootstrapEmail}`);
      } else {
        logger.warn('ADMIN_BOOTSTRAP_EMAIL and ADMIN_BOOTSTRAP_PASSWORD are not set. No default admin created.');
      }
    }

    const adminExists = adminResult.rows.length > 0;
    if (adminExists && (config.adminBootstrapEmail || config.adminBootstrapPassword)) {
      const message = 'SECURITY WARNING: ADMIN_BOOTSTRAP_EMAIL and ADMIN_BOOTSTRAP_PASSWORD should be removed from environment variables after the first admin is created.';
      if (config.isProduction) { logger.error(message); process.exit(1); }
      else { logger.warn(message); }
    }
  } catch (err) {
    logger.error('Error creating default admin:', err);
  }

  const server = app.listen(config.port, () => {
    logger.info(`Backend listening on port ${config.port}`);
  });

  const statsInterval = setInterval(() => { stats.requests = 0; stats.errors = 0; }, 60000);
  const cleanupInterval = startCleanupScheduler();

  async function shutdown(signal) {
    logger.info(`${signal} received, shutting down gracefully`);
    clearInterval(statsInterval);
    clearInterval(cleanupInterval);
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

startServer().catch((err) => {
  logger.error('Failed to start server:', err);
  process.exit(1);
});
