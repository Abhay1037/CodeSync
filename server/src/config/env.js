import dotenv from 'dotenv';

// Load variables from .env into process.env as early as possible.
dotenv.config();

/**
 * Base URL for the Piston-compatible execution API. There is deliberately no
 * public fallback: emkc.org is whitelist-only as of 2026-02-15.
 *
 * Accept both ".../api/v2" and ".../api/v2/execute" so a full endpoint URL
 * copied from a provider still works with the `/execute` call in the runner.
 */
const pistonApiUrl = (process.env.PISTON_API_URL ?? '')
  .trim()
  .replace(/\/execute\/?$/, '')
  .replace(/\/+$/, '');

/**
 * Centralised, validated runtime configuration.
 * Importing this module guarantees the rest of the app reads a single
 * source of truth instead of scattering `process.env` lookups everywhere.
 */
export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT) || 5000,

  /**
   * Allowed browser origins. Supports a comma-separated list so the same
   * build can serve local dev, staging and production front-ends.
   */
  clientOrigins: [
    ...(process.env.CLIENT_ORIGIN ?? 'http://localhost:5173')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    // Render sets this to the service's public URL. Including it lets the
    // single-service deploy work without hard-coding an onrender.com domain.
    ...(process.env.RENDER_EXTERNAL_URL ? [process.env.RENDER_EXTERNAL_URL] : []),
  ],

  /**
   * Remote code-execution backend. Required in production; set PISTON_API_URL
   * to your self-hosted runner's v2 API base, e.g. http://localhost:2000/api/v2.
   * The browser never sees this value or the optional API key below.
   */
  pistonApiUrl,
  pistonTimeoutMs: Number(process.env.PISTON_TIMEOUT_MS) || 10000,
  /** Optional bearer token for authenticated/self-hosted runners. */
  pistonApiKey: process.env.PISTON_API_KEY ?? '',

  /**
   * Local execution runs user code as a child process of the API server, so it
   * is a DEVELOPMENT-ONLY convenience (no sandbox, no resource isolation).
   * It defaults to on outside production and can be forced with
   * ALLOW_LOCAL_EXEC=true|false. Production deployments should use Piston.
   */
  allowLocalExec:
    process.env.ALLOW_LOCAL_EXEC != null
      ? process.env.ALLOW_LOCAL_EXEC === 'true'
      : (process.env.NODE_ENV ?? 'development') !== 'production',

  /** MongoDB connection string (local by default; use Atlas in production). */
  mongoUri: process.env.MONGO_URI ?? 'mongodb://127.0.0.1:27017/codesync',

  /** JWT signing secret + lifetime. ALWAYS override the secret in prod. */
  jwtSecret: process.env.JWT_SECRET ?? 'codesync-dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',

  /** How long to debounce room-code persistence to MongoDB (ms). */
  persistDebounceMs: Number(process.env.PERSIST_DEBOUNCE_MS) || 1200,

  /**
   * Idle rooms older than this are deleted from MongoDB by a periodic sweep.
   * Set to 0 to disable cleanup entirely.
   */
  roomTtlDays: Number(process.env.ROOM_TTL_DAYS ?? 30),

  /** Optional override for the built frontend folder served in production. */
  clientDistPath: process.env.CLIENT_DIST_PATH ?? '',

  /** Simple in-memory rate limits for the public auth/execute endpoints. */
  rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  authRateLimitMax: Number(process.env.AUTH_RATE_LIMIT_MAX) || 100,
  executeRateLimitMax: Number(process.env.EXECUTE_RATE_LIMIT_MAX) || 60,
};

export const isProduction = env.nodeEnv === 'production';
