import http from 'node:http';
import { Server } from 'socket.io';
import { io as createClient } from 'socket.io-client';

/**
 * Boot a real HTTP + Socket.io server on an ephemeral port for integration
 * tests, wired exactly like `server.js` but without the boot side effects
 * (no port 5000, no signal handlers, no cleanup timers).
 */
export async function startTestServer() {
  const { createApp } = await import('../../src/app.js');
  const { registerSocketHandlers } = await import('../../src/sockets/socketHandler.js');

  const app = createApp();
  const httpServer = http.createServer(app);
  const ioServer = new Server(httpServer, {
    cors: { origin: '*' },
    transports: ['websocket'],
    pingTimeout: 20000,
  });

  ioServer.on('connection', (socket) => registerSocketHandlers(ioServer, socket));

  await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const { port } = httpServer.address();

  return {
    url: `http://127.0.0.1:${port}`,
    app,
    async close() {
      ioServer.close();
      await new Promise((resolve) => httpServer.close(resolve));
    },
  };
}

/** Connect a socket client and wait until it is ready. */
export function connectClient(url) {
  const socket = createClient(url, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('socket connect timeout')), 5000);
    socket.once('connect', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once('connect_error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/** Emit an event and await its acknowledgement callback. */
export function emitAck(socket, event, payload) {
  return new Promise((resolve) => {
    socket.emit(event, payload, resolve);
  });
}

/** Resolve with the next payload for `event`, or reject after `ms`. */
export function nextEvent(socket, event, ms = 2000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), ms);
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

/** Sleep helper for "this event should NOT arrive" assertions. */
export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
