/**
 * Backend base URL shared by REST and Socket.io.
 *
 * Local development: VITE_SERVER_URL (or the default localhost:5000).
 * Production: the built SPA is served by the same Express/Socket.io service,
 * so we use the page's own origin. One build then works on any Render URL or
 * custom domain without a rebuild.
 */
export const SERVER_URL =
  import.meta.env.VITE_SERVER_URL?.trim() ||
  (import.meta.env.DEV
    ? 'http://localhost:5000'
    : typeof window !== 'undefined'
      ? window.location.origin
      : '');
