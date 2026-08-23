// backend/src/config/trusted-proxies.js
// Centralized proxy trust configuration.

export const TRUSTED_PROXIES = [
  'loopback',
  'linklocal',
];

export function configureTrustProxy(app) {
  app.set('trust proxy', TRUSTED_PROXIES);
}
