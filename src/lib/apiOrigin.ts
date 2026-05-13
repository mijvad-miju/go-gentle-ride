/**

 * Base URL for HTTP API and Socket.IO (no trailing slash).

 * In development, defaults to same-origin so Vite proxies requests to the backend.

 * Set VITE_API_URL when the UI is hosted separately from the API (production).

 */

export function getApiOrigin(): string {

  const configured = import.meta.env.VITE_API_URL?.trim();

  if (configured) return configured.replace(/\/$/, '');

  if (import.meta.env.DEV) return '';

  return 'http://localhost:5000';

}


