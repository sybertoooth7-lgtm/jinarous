import * as Sentry from '@sentry/node';
import { logger } from './logger.js';

const sentryEnabled = Boolean(process.env.SENTRY_DSN);

export function initErrorTracking() {
  if (!sentryEnabled) {
    logger.info('SENTRY_DSN not set — error tracking to Sentry is disabled (this is fine for local dev).');
    return;
  }

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: 0.1,
  });
  logger.info('Sentry error tracking initialized.');
}

export function captureError(err, context = {}) {
  logger.error({ err, ...context }, err.message);
  if (sentryEnabled) {
    Sentry.captureException(err, { extra: context });
  }
}

const alertThrottle = new Map(); // key -> last-sent timestamp (ms)
const ALERT_THROTTLE_MS = 5 * 60 * 1000; // don't re-send the same alert key more than once per 5 min

/**
 * Sends a one-line alert to a Slack or Discord incoming webhook, if configured.
 * Both platforms accept the same simple { text } / { content } shape closely
 * enough that we just try Slack's format first; Discord also accepts "content".
 * Fully optional - if ALERT_WEBHOOK_URL isn't set, this is a silent no-op.
 *
 * @param {string} message
 * @param {string} [throttleKey] - alerts sharing a key are rate-limited together
 */
export async function sendAlert(message, throttleKey = message) {
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) return;

  const lastSent = alertThrottle.get(throttleKey) || 0;
  if (Date.now() - lastSent < ALERT_THROTTLE_MS) return;
  alertThrottle.set(throttleKey, Date.now());

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: message, content: message }),
    });
  } catch (err) {
    // Never let a failed alert crash the request that triggered it.
    logger.warn({ err }, 'Failed to send alert webhook');
  }
}
