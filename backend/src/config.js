// backend/src/config.js
import dotenv from 'dotenv';

dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';
const warnings = [];

// JWT Secret validation
// No dev fallback secret: a hardcoded 'dev-secret-change-me' is a real risk
// if NODE_ENV is ever accidentally unset on a deployed container, since the
// app would boot silently with a publicly-known secret. Always require a
// real value, in every environment.
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  throw new Error('JWT_SECRET is required (set it in your .env for local development too).');
}
if (jwtSecret.length < 32) {
  warnings.push('JWT_SECRET is too short. It should be at least 32 characters for security.');
}
if (jwtSecret === 'your-64-char-random-secret-here-change-me' || jwtSecret === 'secret') {
  warnings.push('JWT_SECRET appears to be a default value. Please change it to a random string.');
}

// Cookie Secret validation
const cookieSecret = process.env.COOKIE_SECRET || jwtSecret;
if (cookieSecret.length < 32) {
  warnings.push('COOKIE_SECRET is too short. It should be at least 32 characters for security.');
}

// CORS validation
const corsOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map(o => o.trim().replace(/\/+$/, ''))
  .filter(Boolean) || false;

if (isProduction) {
  if (!corsOrigins || corsOrigins.length === 0) {
    warnings.push('CORS_ORIGIN is not set in production. CORS is disabled.');
  }
  if (corsOrigins && corsOrigins.some(o => !o.startsWith('https://'))) {
    warnings.push('CORS_ORIGIN contains non-HTTPS origins in production.');
  }
}

if (isProduction && process.env.DB_SSL === 'false') {
  warnings.push('DB_SSL is set to false in production. Database traffic will be unencrypted.');
}

if (warnings.length > 0) {
  console.warn('[config] Security warnings:');
  warnings.forEach(w => console.warn(`  - ${w}`));
}

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  isProduction,
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '2h',
  cookieSecret,
  corsOrigin: corsOrigins,
  adminBootstrapEmail: process.env.ADMIN_BOOTSTRAP_EMAIL,
  adminBootstrapPassword: process.env.ADMIN_BOOTSTRAP_PASSWORD,
  dbSsl: isProduction && process.env.DB_SSL !== 'false',
};
