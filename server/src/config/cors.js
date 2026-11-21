import { env, isProduction } from './env.js';

/** True for loopback origins, which Vite may print as either host name. */
function isLocalOrigin(origin) {
  try {
    const { hostname } = new URL(origin);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  } catch {
    return false;
  }
}

/**
 * Shared CORS policy used by BOTH Express (REST) and Socket.io (WebSocket).
 *
 * Keeping a single object prevents the classic bug where REST requests work
 * but the WebSocket handshake is silently rejected by a stricter default.
 */
export const corsOptions = {
  origin(origin, callback) {
    // Allow same-origin / server-to-server calls that omit the Origin header
    // (e.g. curl, health checks, SSR).
    if (!origin) return callback(null, true);

    if (env.clientOrigins.includes(origin)) return callback(null, true);

    // When the built SPA is served by this same server, its origin is the API
    // origin (localhost:5000 locally, or the deployed domain supplied via
    // CLIENT_ORIGIN). Allow the loopback form of our own port in production.
    if (
      isProduction &&
      [`http://localhost:${env.port}`, `http://127.0.0.1:${env.port}`].includes(origin)
    ) {
      return callback(null, true);
    }

    // In development, accept loopback on any port. Vite advertises both
    // localhost and 127.0.0.1, and a mismatch here breaks the WS handshake.
    if (!isProduction && isLocalOrigin(origin)) return callback(null, true);

    return callback(new Error(`CORS: origin '${origin}' is not allowed.`));
  },
  credentials: true,
  // DELETE is required by DELETE /api/rooms/:roomId. Without it the browser's
  // preflight request is rejected and the owner cannot delete a room.
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
};
