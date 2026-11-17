import express from 'express';
import cors from 'cors';
import { corsOptions } from './config/cors.js';
import { healthRouter } from './routes/health.js';
import { executeRouter } from './routes/execute.js';
import { authRouter } from './routes/auth.js';
import { roomsRouter } from './routes/rooms.js';
import { isProduction } from './config/env.js';

/**
 * Build and configure the Express application.
 * Returning the app (rather than listening here) keeps it testable and
 * separates HTTP concerns from the Socket.io bootstrap in server.js.
 */
export function createApp() {
  const app = express();

  // Trust the platform proxy so secure cookies / rate-limit IPs work later.
  app.set('trust proxy', 1);

  // --- Global middleware -------------------------------------------------
  app.use(cors(corsOptions));
  app.use(express.json({ limit: '1mb' }));

  // --- Routes ------------------------------------------------------------
  app.use('/api', healthRouter);
  app.use('/api', executeRouter);
  app.use('/api', authRouter);
  app.use('/api', roomsRouter);

  // Root hint so hitting the server in a browser isn't a blank 404.
  app.get('/', (_req, res) => {
    res.json({ name: 'CodeSync API', docs: '/api/health' });
  });

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
