import pino from 'pino';

// Structured JSON logging. In production these lines go to stdout, which is
// exactly what Railway (and most hosts) capture and make searchable in their
// logs dashboard - no extra log-shipping setup needed.
//
// Locally, pino-pretty is used if installed as a dev convenience; otherwise
// falls back to plain JSON lines, which is what you want in production anyway.
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: ['req.headers.authorization', 'password', 'passwordHash', '*.password'],
    censor: '[REDACTED]',
  },
});

export default logger;
