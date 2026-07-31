const isProduction = process.env.NODE_ENV === 'production';
const errors = [];
const warnings = [];

if (!process.env.JWT_SECRET) {
  errors.push('JWT_SECRET is not set. Admin login will fail on every request.');
} else if (process.env.JWT_SECRET.length < 32) {
  warnings.push(`JWT_SECRET is only ${process.env.JWT_SECRET.length} chars — use 32+ bytes.`);
}

if (!process.env.DATABASE_URL) {
  errors.push('DATABASE_URL is not set. PostgreSQL is required.');
}

if (isProduction) {
  if (!process.env.CORS_ORIGIN) {
    errors.push('CORS_ORIGIN is not set in production. Refusing to start.');
  } else {
    const origins = process.env.CORS_ORIGIN.split(',').map(o => o.trim()).filter(Boolean);
    for (const o of origins) {
      if (!/^https?:\/\//i.test(o)) {
        errors.push(`CORS_ORIGIN entry '${o}' is missing scheme (http:// or https://).`);
      }
    }
  }
  if (!process.env.ADMIN_EMAIL) {
    warnings.push('ADMIN_EMAIL is not set — contact form submissions will not be emailed to anyone.');
  }
  if (!process.env.SENTRY_DSN) {
    warnings.push('SENTRY_DSN is not set — error tracking is a no-op.');
  }
}

if (errors.length > 0) {
  console.error('\n[config] Refusing to start:\n');
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

if (warnings.length > 0) {
  console.warn('\n[config] Warnings:\n');
  for (const w of warnings) console.warn(`  - ${w}`);
}

export const config = {
  isProduction,
  port: Number(process.env.PORT) || 4000,
  corsOrigins: (process.env.CORS_ORIGIN || '')
    .split(',')
    .map(o => o.trim().replace(/\/+$/, ''))
    .filter(Boolean),
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
};
