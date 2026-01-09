/**
 * Utility for making authenticated API requests
 * Handles session expiration and redirects to login when needed
 */

type FetchOptions = RequestInit & {
  /** If true, won't redirect to login on 401 (default: false) */
  suppressAuthRedirect?: boolean;
};

/**
 * Wrapper around fetch that:
 * 1. Always includes credentials
 * 2. Handles 401 responses by dispatching a session expired event
 * 
 * Usage:
 * const response = await authFetch('/api/some-endpoint');
 * const response = await authFetch('/api/some-endpoint', { method: 'POST', body: JSON.stringify(data) });
 */
export async function authFetch(url: string, options: FetchOptions = {}): Promise<Response> {
  const { suppressAuthRedirect, ...fetchOptions } = options;
  
  const response = await fetch(url, {
    ...fetchOptions,
    credentials: 'include',
  });

  // Handle session expiration
  if (response.status === 401 && !suppressAuthRedirect) {
    // Dispatch event that AuthContext can listen to
    window.dispatchEvent(new CustomEvent('sessionExpired'));
  }

  return response;
}

/**
 * Helper to check if a response indicates an auth error
 */
export function isAuthError(response: Response): boolean {
  return response.status === 401;
}
