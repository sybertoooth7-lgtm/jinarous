// frontend/src/lib/security.ts
// Client-side utilities for CSRF handling and honeypot support.
// NOTE: Request signing was removed because any client-side secret
// is trivially extractable from the JS bundle, making it useless.

import { API_BASE } from './api';

/**
 * Fetch wrapper that automatically attaches:
 * - CSRF token from cookie header (only for state-changing methods)
 * - Standard browser headers that bots often omit
 * - credentials: 'include' for cookie-based auth
 */
export async function secureFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const url = `${API_BASE}${path}`;
  const headers = new Headers(options.headers || {});
  const method = (options.method || 'GET').toUpperCase();

  // CSRF token from cookie (set by server middleware) — only for state-changing methods
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const csrfMatch = document.cookie.match(/csrfToken=([^;]+)/);
    if (csrfMatch) {
      headers.set('x-csrf-token', csrfMatch[1]);
    }
  }

  // Standard browser headers
  headers.set('Accept', 'application/json');
  headers.set('Accept-Language', navigator.language || 'en-US');

  return fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });
}

/**
 * Checks if the honeypot field was filled. Call this before submitting a form.
 * Returns true if the submission looks bot-generated.
 */
export function isHoneypotTriggered(): boolean {
  const el = document.getElementById('website_url') as HTMLInputElement | null;
  return !!(el && el.value && el.value.trim().length > 0);
}
