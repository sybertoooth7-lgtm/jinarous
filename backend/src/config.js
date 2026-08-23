const isProduction = process.env.NODE_ENV === 'production';
const errors = [];
const warnings = [];

function calculateEntropy(str) {
  const len = str.length;
  if (len === 0) return 0;
  const freq = {};
  for (const ch of str) {
    freq[ch] = (freq[ch] || 0) + 1;
  }
  let entropy = 0;
  for (const count of Object.values(freq)) {
    const p = count / len;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

const WEAK_SECRET_PATTERNS = [
  'secret', 'jwtsecret', 'changeme', 'password', 'admin', '123456',
  'default', 'test', 'dev', 'local', 'mysecret', 'your-256-bit-secret',
  'supersecret', 'secretkey', 'privatekey', 'token', 'auth', 'password123',
];

if (!process.env.JWT_SECRET) {
  errors.push('JWT_SECRET is not set. Admin and client login will fail on every request.');
} else {
  const secret = process.env.JWT_SECRET;

  if (secret.length < 32) {
    errors.push(`JWT_SECRET is only ${secret.length} chars — minimum 32 required.`);
  }

  const entropy = calculateEntropy(secret);
  if (entropy < 3.5) {
    errors.push(
      `JWT_SECRET entropy is ${entropy.toFixed(2)} bits/char — minimum 3.5 required. ` +
      `Generate it with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
    );
  }

  const lower = secret.toLowerCase();
  for (const weak of WEAK_SECRET_PATTERNS) {
    if (lower.includes(weak)) {
      errors.push(
        `JWT_SECRET contains weak pattern '${weak}'. ` +
        `Use a cryptographically random string, not a dictionary word.`
      );
      break;
    }
  }
}

if (!process.env.DATABASE_URL) {
  errors.push('DATABASE_URL is not set. PostgreSQL is required.');
}

// FIX C4: validate cookie secret
if (!process.env.COOKIE_SECRET) {
  errors.push('COOKIE_SECRET is not set. Cookie signatures cannot be verified.');
} else if (process.env.COOKIE_SECRET.length < 32) {
  errors.push('COOKIE_SECRET must be at least 32 characters.');
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
  for (const e of errors) console.error(` - ${e}`);
  process.exit(1);
}

if (warnings.length > 0) {
  console.warn('\n[config] Warnings:\n');
  for (const w of warnings) console.warn(` - ${w}`);
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
  // FIX C4: export cookieSecret so cookieParser can use it
  cookieSecret: process.env.COOKIE_SECRET,
  // Export bootstrap credentials so index.js can read them
  adminBootstrapEmail: process.env.ADMIN_BOOTSTRAP_EMAIL || null,
  adminBootstrapPassword: process.env.ADMIN_BOOTSTRAP_PASSWORD || null,
};
