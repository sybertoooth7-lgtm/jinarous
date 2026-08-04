const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const cluster = require('cluster');
const os = require('os');

const db = require('./db');
const { loadPersistedValues } = require('./stats');
const { limiter } = require('./middleware/rate-limit');
const contactRoutes = require('./routes/contact');
const { router: adminRoutes } = require('./routes/admin');
const toolsRoutes = require('./routes/tools');

const PORT = process.env.PORT || 3001;
const CLUSTER_MODE = process.env.CLUSTER_MODE === 'true';

async function startServer() {
  const app = express();

  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      }
    }
  }));

  app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true
  }));

  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  // Fix #5: Apply cluster-aware rate limiter
  app.use('/api/', limiter);

  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Routes
  app.use('/api/contact', contactRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/tools', toolsRoutes);

  // Serve admin dashboard static files
  app.use('/admin', express.static('public/admin'));

  // Error handler
  app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT} (worker ${cluster.isWorker ? cluster.worker.id : 'master'})`);
  });
}

async function main() {
  try {
    // Verify DB connection
    await db.query('SELECT 1');
    console.log('[db] Connected successfully');

    // Fix #7: Load stats after DB is confirmed ready
    await loadPersistedValues();
  } catch (err) {
    console.error('[startup] Failed to initialize:', err.message);
    process.exit(1);
  }

  if (CLUSTER_MODE && cluster.isPrimary) {
    const numWorkers = process.env.WORKERS || os.cpus().length;
    console.log(`[cluster] Master ${process.pid} starting ${numWorkers} workers...`);
    for (let i = 0; i < numWorkers; i++) {
      cluster.fork();
    }
    cluster.on('exit', (worker) => {
      console.log(`[cluster] Worker ${worker.process.pid} died. Restarting...`);
      cluster.fork();
    });
  } else {
    await startServer();
  }
}

main();
