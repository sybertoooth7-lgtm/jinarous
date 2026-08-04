import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { body, param, validationResult } from 'express-validator';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import db from '../db.js';
import { requireAdmin } from '../middleware/auth.js';
import { logger } from '../logger.js';
import { PostgresRateLimitStore } from '../lib/rate-limit-store.js';

const router = Router();
router.use(requireAdmin);

const toolRunLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many tool runs. Please wait before running another audit.' },
  store: new PostgresRateLimitStore(15 * 60 * 1000),
});

// ... rest of the file stays exactly the same ...
