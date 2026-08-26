// backend/src/logger.js
import pino from 'pino';

// pino-pretty makes local dev logs readable, but it's a dev convenience
// only — it should never be a hard requirement for booting the app. If
// it's not installed (or NODE_ENV ever ends up unset/misconfigured on a
// host, instead of explicitly "production"), fall back to plain JSON
// lines rather than crashing. Plain JSON is also exactly what you want in
// production anyway, so this fails safe in both directions.
function resolveTransport() {
  if (process.env.NODE_ENV === 'production') return undefined;
  try {
    import.meta.resolve('pino-pretty');
    return { target: 'pino-pretty', options: { colorize: true } };
  } catch {
    return undefined;
  }
}

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: resolveTransport(),
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-csrf-token"]',
      'res.headers["set-cookie"]',
      'password',
      'passwordHash',
      '*.password',
    ],
    censor: '[REDACTED]',
  },
});
