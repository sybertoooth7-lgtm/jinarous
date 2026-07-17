import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import contactRoutes from './routes/contact.js';
import adminRoutes from './routes/admin.js';
import statusRoutes from './routes/status.js';
import { recordRequest } from './stats.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.set('trust proxy', 1);

const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  helmet({
    contentSecurityPolicy: false, // the admin dashboard is a simple static page; relax CSP for it
  })
);
app.use(
  cors({
    origin: allowedOrigins.length ? allowedOrigins : true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  })
);
app.use(express.json({ limit: '100kb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

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

app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));
app.use('/api/contact', contactRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/status', statusRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Not found.' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our end.' });
});

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`Alux Plaza backend listening on http://localhost:${port}`);
  console.log(`Admin dashboard at http://localhost:${port}/admin`);
});
