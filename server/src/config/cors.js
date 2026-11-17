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

    // In development, accept loopback on any port. Vite advertises both
    // localhost and 127.0.0.1, and a mismatch here breaks the WS handshake.
    if (!isProduction && isLocalOrigin(origin)) return callback(null, true);

    return callback(new Error(`CORS: origin '${origin}' is not allowed.`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
};
