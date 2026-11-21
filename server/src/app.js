import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { corsOptions } from './config/cors.js';
import { env, isProduction } from './config/env.js';
import { createRateLimiter } from './middleware/rateLimit.js';
import { healthRouter } from './routes/health.js';
import { executeRouter } from './routes/execute.js';
import { authRouter } from './routes/auth.js';
import { roomsRouter } from './routes/rooms.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = env.clientDistPath
  ? path.resolve(env.clientDistPath)
  : path.resolve(__dirname, '../../client/dist');

/** Only serve the SPA in production, and only if it has actually been built. */
const serveClient = isProduction && fs.existsSync(path.join(clientDist, 'index.html'));

/**
 * Build and configure the Express application.
 * Returning the app (rather than listening here) keeps it testable and
 * separates HTTP concerns from the Socket.io bootstrap in server.js.
 */
export function createApp() {
  const app = express();

  // Trust the platform proxy so rate-limit IPs work behind a load balancer.
  app.set('trust proxy', 1);

  // --- Global middleware -------------------------------------------------
  app.use(cors(corsOptions));
  app.use(express.json({ limit: '1mb' }));

  // --- Abuse protection for the public endpoints ------------------------
  // Only the credential/token-issuing endpoints are limited. Limiting
  // /api/auth/me too would log users out when the counter trips.
  const authLimiter = createRateLimiter({
    windowMs: env.rateLimitWindowMs,
    max: env.authRateLimitMax,
    prefix: 'auth',
  });
  app.use('/api/auth/register', authLimiter);
  app.use('/api/auth/login', authLimiter);
  app.use(
    '/api/execute',
    createRateLimiter({
      windowMs: env.rateLimitWindowMs,
      max: env.executeRateLimitMax,
      prefix: 'execute',
      message: 'Too many code executions. Please slow down.',
    })
  );

  // --- Routes ------------------------------------------------------------
  app.use('/api', healthRouter);
  app.use('/api', executeRouter);
  app.use('/api', authRouter);
  app.use('/api', roomsRouter);

  // --- Static frontend (production) -------------------------------------
  if (serveClient) {
    app.use(express.static(clientDist, { index: false }));

    // SPA fallback for client-side routes (/login, /room/:id, ...).
    // API paths must fall through to the JSON 404 handler below.
    app.get('*', (req, res, next) => {
      if (req.path === '/api' || req.path.startsWith('/api/')) return next();
      return res.sendFile(path.join(clientDist, 'index.html'));
    });
  } else {
    // Root hint so hitting the API in a browser isn't a blank 404.
    app.get('/', (_req, res) => {
      res.json({ name: 'CodeSync API', docs: '/api/health' });
    });
  }

  // --- 404 handler -------------------------------------------------------
  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // --- Centralised error handler ----------------------------------------
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    const status = err.status ?? 500;
    res.status(status).json({
      error: err.message ?? 'Internal Server Error',
      ...(isProduction ? {} : { stack: err.stack }),
    });
  });

  return app;
}

export { serveClient, clientDist };
