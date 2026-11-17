import http from 'node:http';
import { Server } from 'socket.io';

import { createApp } from './app.js';
import { env } from './config/env.js';
import { corsOptions } from './config/cors.js';
import { connectDB, disconnectDB } from './db/connect.js';
import { User } from './models/User.js';
import { verifyToken } from './services/authService.js';
import { flushPending, cleanupStaleRooms } from './services/roomService.js';
import { registerSocketHandlers } from './sockets/socketHandler.js';

/**
 * CodeSync server bootstrap.
 *
 * Flow:
 *   1. Build the Express app (REST API).
 *   2. Connect MongoDB (required - fail fast if unreachable).
 *   3. Wrap the app in a Node HTTP server.
 *   4. Attach Socket.io to that SAME server so REST + WS share one port.
 *   5. Wire per-connection socket handlers.
 *   6. Start listening.
 */

// 1 ----------------------------------------------------------------------
const app = createApp();

// 2 ----------------------------------------------------------------------
try {
  await connectDB();
} catch (err) {
  console.error('[db] failed to connect - is MongoDB running?');
  console.error(err.message);
  process.exit(1);
}

// 3 ----------------------------------------------------------------------
const httpServer = http.createServer(app);

// 4 ----------------------------------------------------------------------
const io = new Server(httpServer, {
  // Reuse the exact same origin allow-list as the REST layer.
  cors: corsOptions,

  // Prefer WebSocket, transparently fall back to long-polling on hostile
  // networks (university Wi-Fi / firewalls).
  transports: ['websocket', 'polling'],

  // How long to wait for a reconnecting client before giving up on it.
  pingTimeout: 20000,
});

// Optional auth for sockets: resolve a JWT from the handshake if present.
// Guests (no token) are still allowed, so the app works without logging in.
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    const payload = token ? verifyToken(token) : null;
    if (payload) {
      const user = await User.findById(payload.sub).select('username').lean();
      if (user) {
        socket.data.user = { id: user._id.toString(), username: user.username };
      }
    }
    next();
  } catch {
    next(); // never hard-fail the connection over auth
  }
});

// 5 ----------------------------------------------------------------------
io.on('connection', (socket) => {
  if (env.nodeEnv !== 'production') {
    console.log(`[socket] connected: ${socket.id}`);
  }
  registerSocketHandlers(io, socket);
});

// 6 ----------------------------------------------------------------------
httpServer.listen(env.port, () => {
  console.log(`[server] CodeSync running on http://localhost:${env.port}`);
  console.log(`[server] allowed origins: ${env.clientOrigins.join(', ')}`);
});

// --- Idle-room cleanup --------------------------------------------------
// Rooms are persisted forever by default, which slowly fills the collection.
// Sweep once shortly after boot and then every 6 hours.
if (env.roomTtlDays > 0) {
  const runCleanup = async () => {
    try {
      const removed = await cleanupStaleRooms(env.roomTtlDays);
      if (removed > 0) {
        console.log(
          `[cleanup] removed ${removed} idle room(s) inactive for ${env.roomTtlDays}+ days`
        );
      }
    } catch (err) {
      console.error('[cleanup] failed:', err.message);
    }
  };

  const timer = setInterval(runCleanup, 6 * 60 * 60 * 1000);
  timer.unref?.();
  const firstRun = setTimeout(runCleanup, 15000);
  firstRun.unref?.();
}

// --- Graceful shutdown --------------------------------------------------
// Close sockets + HTTP server cleanly on Ctrl+C / container stop, flushing
// any debounced room-code writes that are still in flight.
function shutdown(signal) {
  console.log(`\n[server] ${signal} received, shutting down...`);
  io.close();
  httpServer.close(async () => {
    await flushPending();
    await disconnectDB();
    console.log('[server] closed. Bye.');
    process.exit(0);
  });
}

['SIGINT', 'SIGTERM'].forEach((signal) => {
  process.on(signal, () => shutdown(signal));
});

export { app, io, httpServer };
