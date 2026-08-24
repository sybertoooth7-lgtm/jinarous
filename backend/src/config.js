// backend/src/config.js
import dotenv from 'dotenv';

dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';
const warnings = [];

// JWT Secret validation
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  if (isProduction) {
    throw new Error('JWT_SECRET is required in production');
  }
  warnings.push('JWT_SECRET is not set. Using a default secret for development only.');
}
if (jwtSecret && jwtSecret.length < 32) {
  warnings.push('JWT_SECRET is too short. It should be at least 32 characters for security.');
}
if (jwtSecret && (jwtSecret === 'your-64-char-random-secret-here-change-me' || jwtSecret === 'secret')) {
  warnings.push('JWT_SECRET appears to be a default value. Please change it to a random string.');
}

// Cookie Secret validation
const cookieSecret = process.env.COOKIE_SECRET || jwtSecret;
if (!cookieSecret) {
  if (isProduction) {
    throw new Error('COOKIE_SECRET is required in production');
  }
  warnings.push('COOKIE_SECRET is not set. Using JWT_SECRET as fallback for development only.');
}
if (cookieSecret && cookieSecret.length < 32) {
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
  jwtSecret: jwtSecret || 'dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '2h',
  cookieSecret: cookieSecret || 'dev-cookie-secret-change-me',
  corsOrigin: corsOrigins,
  adminBootstrapEmail: process.env.ADMIN_BOOTSTRAP_EMAIL,
  adminBootstrapPassword: process.env.ADMIN_BOOTSTRAP_PASSWORD,
  dbSsl: isProduction && process.env.DB_SSL !== 'false',
};
