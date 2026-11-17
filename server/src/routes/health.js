import { Router } from 'express';
import { getRoomCount } from '../sockets/roomStore.js';

/**
 * Lightweight REST surface.
 * Health checks are what load balancers / uptime monitors poll, so keep
 * them dependency-free and fast.
 */
export const healthRouter = Router();

healthRouter.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'codesync-server',
    uptime: process.uptime(),
    activeRooms: getRoomCount(),
    timestamp: new Date().toISOString(),
  });
});
