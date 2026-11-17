import dotenv from 'dotenv';

// Load variables from .env into process.env as early as possible.
dotenv.config();

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
  clientOrigins: (process.env.CLIENT_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),

  /**
   * Remote code-execution backend (Piston). Self-host with Docker later by
   * pointing this at your own instance, e.g. http://localhost:2000.
   */
  pistonUrl: (process.env.PISTON_URL ?? 'https://emkc.org/api/v2/piston').replace(/\/$/, ''),
  pistonTimeoutMs: Number(process.env.PISTON_TIMEOUT_MS) || 10000,
  /** Optional bearer token for authenticated/self-hosted runners. */
  pistonApiKey: process.env.PISTON_API_KEY ?? '',

  /** MongoDB connection string (local by default; use Atlas in production). */
  mongoUri: process.env.MONGO_URI ?? 'mongodb://127.0.0.1:27017/codesync',

  /** JWT signing secret + lifetime. ALWAYS override the secret in prod. */
  jwtSecret: process.env.JWT_SECRET ?? 'codesync-dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',

  /** How long to debounce room-code persistence to MongoDB (ms). */
  persistDebounceMs: Number(process.env.PERSIST_DEBOUNCE_MS) || 1200,
};

export const isProduction = env.nodeEnv === 'production';
