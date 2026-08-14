// frontend/src/lib/secureFetch.ts
/**
 * Wrapper around fetch that automatically reads the csrfToken cookie
 * and sends it in the x-csrf-token header for state-changing requests.
 */
export async function secureFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const method = (init?.method || 'GET').toUpperCase();
  const headers = new Headers(init?.headers);

  // Only attach CSRF token for state-changing methods
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const csrfToken = document.cookie
      .split('; ')
      .find(row => row.startsWith('csrfToken='))
      ?.split('=')[1];

    if (csrfToken) {
      headers.set('x-csrf-token', csrfToken);
    }
  }

  return fetch(input, {
    ...init,
    headers,
    credentials: 'include',
  });
}
