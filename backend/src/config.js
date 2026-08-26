// backend/src/config.js
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const isProduction = process.env.NODE_ENV === 'production';
const warnings = [];
const fatalErrors = [];

// JWT Secret validation
// No dev fallback secret: a hardcoded 'dev-secret-change-me' is a real risk
// if NODE_ENV is ever accidentally unset on a deployed container, since the
// app would boot silently with a publicly-known secret. Always require a
// real value, in every environment.
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  fatalErrors.push('JWT_SECRET is not set. Admin and client login will fail on every request.');
}
if (jwtSecret && jwtSecret.length < 32) {
  warnings.push('JWT_SECRET is too short. It should be at least 32 characters for security.');
}
if (jwtSecret === 'your-64-char-random-secret-here-change-me' || jwtSecret === 'secret') {
  warnings.push('JWT_SECRET appears to be a default value. Please change it to a random string.');
}

// Cookie Secret validation
const cookieSecret = process.env.COOKIE_SECRET || jwtSecret || '';
if (cookieSecret && cookieSecret.length < 32) {
  warnings.push('COOKIE_SECRET is too short. It should be at least 32 characters for security.');
}

// CORS validation
// CORS_ORIGIN is required in production — without it, the browser silently
// blocks every request from the real frontend, which is a confusing,
// hard-to-diagnose way for the whole site to go down. Fail loudly at boot
// instead. A trailing slash is stripped rather than left as a value that
// can never match a real Origin header (browsers never send one).
const rawCorsOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map(o => o.trim().replace(/\/+$/, ''))
  .filter(Boolean);

if (isProduction) {
  if (rawCorsOrigins.length === 0) {
    fatalErrors.push('CORS_ORIGIN is not set in production. Set it to your frontend\'s origin(s), comma-separated.');
  } else {
    const missingScheme = rawCorsOrigins.filter(o => !/^https?:\/\//.test(o));
    if (missingScheme.length > 0) {
      fatalErrors.push(`CORS_ORIGIN entry is missing scheme (http:// or https://): ${missingScheme.join(', ')}`);
    }
    const nonHttps = rawCorsOrigins.filter(o => o.startsWith('http://'));
    if (nonHttps.length > 0) {
      warnings.push(`CORS_ORIGIN contains non-HTTPS origins in production: ${nonHttps.join(', ')}`);
    }
  }
}

const corsOrigins = rawCorsOrigins;

if (isProduction && process.env.DB_SSL === 'false') {
  warnings.push('DB_SSL is set to false in production. Database traffic will be unencrypted.');
}

if (warnings.length > 0) {
  console.warn('[config] Security warnings:');
  warnings.forEach(w => console.warn(`  - ${w}`));
}

if (fatalErrors.length > 0) {
  console.error('[config] Refusing to start:\n');
  fatalErrors.forEach(e => console.error(`  - ${e}`));
  process.exit(1);
}

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  isProduction,
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '2h',
  cookieSecret,
  corsOrigins,
  adminBootstrapEmail: process.env.ADMIN_BOOTSTRAP_EMAIL,
  adminBootstrapPassword: process.env.ADMIN_BOOTSTRAP_PASSWORD,
  dbSsl: isProduction && process.env.DB_SSL !== 'false',
};
