// Centralized environment/config validation. Runs once at boot, before the
// server starts accepting traffic.
//
// This exists because two real footguns were possible before: (1) an
// missing JWT_SECRET meant every admin login attempt would fail with a
// confusing, generic error and no indication of why, and (2) a missing
// CORS_ORIGIN in production silently fell back to reflecting ANY origin
// (`cors({ origin: true })`), which is an easy way to accidentally leave
// the API's contact-form and status endpoints open to being called from
// any website. Both now fail loudly and specifically at startup instead.

const isProduction = process.env.NODE_ENV === 'production';

const errors = [];
const warnings = [];

// --- Required in all environments ---
if (!process.env.JWT_SECRET) {
  errors.push(
    'JWT_SECRET is not set. Admin login/session verification will silently fail on every request. ' +
    'Set a long, random value (e.g. `openssl rand -hex 32`) in your environment.'
  );
} else if (process.env.JWT_SECRET.length < 32) {
  warnings.push(
    `JWT_SECRET is only ${process.env.JWT_SECRET.length} characters - consider a longer, higher-entropy value ` +
    '(e.g. 32+ bytes from `openssl rand -hex 32`) for a production deployment.'
  );
}

// --- Required in production specifically ---
if (isProduction) {
  if (!process.env.CORS_ORIGIN) {
    errors.push(
      'CORS_ORIGIN is not set while NODE_ENV=production. Without it, this server would fall back to ' +
      'accepting cross-origin requests from ANY website - refusing to start rather than deploy with that default. ' +
      'Set CORS_ORIGIN to your real frontend URL(s), comma-separated if more than one ' +
      '(e.g. CORS_ORIGIN=https://aluxplaza.com,https://www.aluxplaza.com).'
    );
  } else {
    const rawOrigins = process.env.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean);
    for (const origin of rawOrigins) {
      if (!/^https?:\/\//i.test(origin)) {
        errors.push(
          `CORS_ORIGIN entry '${origin}' is missing the scheme (http:// or https://). The browser's Origin ` +
          `header always includes it, so a value without one can never match and every request will be ` +
          `silently blocked by CORS - refusing to start with a malformed value rather than deploy broken.`
        );
      }
    }
  }
  if (!process.env.DB_PATH) {
    warnings.push(
      'DB_PATH is not set in production. Confirm the default (./data/alux.db, relative to the backend folder) ' +
      'lives on a PERSISTENT volume on your hosting platform (Railway/Render volumes, not ephemeral container ' +
      'storage) - otherwise all submissions and metrics are lost on every redeploy. See DEPLOYMENT.md.'
    );
  }
  if (!process.env.SENTRY_DSN) {
    warnings.push('SENTRY_DSN is not set - error tracking (see monitoring.js) will be a no-op in production.');
  }
}

if (errors.length > 0) {
  // eslint-disable-next-line no-console
  console.error('\n[config] Refusing to start due to missing required configuration:\n');
  for (const e of errors) {
    // eslint-disable-next-line no-console
    console.error(`  - ${e}\n`);
  }
  process.exit(1);
}

if (warnings.length > 0) {
  // eslint-disable-next-line no-console
  console.warn('\n[config] Startup warnings (server will still start):\n');
  for (const w of warnings) {
    // eslint-disable-next-line no-console
    console.warn(`  - ${w}\n`);
  }
}

export const config = {
  isProduction,
  port: Number(process.env.PORT) || 4000,
  // CORS_ORIGIN must match the browser's Origin header EXACTLY (scheme +
  // host, no path) for the `cors` package's default string comparison to
  // work. A trailing slash is the single most common way to get this
  // wrong (the browser's Origin header never has one), so we strip it
  // here rather than let it silently cause every request to be rejected.
  corsOrigins: (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean),
};
