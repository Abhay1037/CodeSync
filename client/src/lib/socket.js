import { io } from 'socket.io-client';

/**
 * Single shared Socket.io client instance.
 *
 * A module-level singleton prevents React StrictMode (and hot reloads) from
 * opening multiple sockets, which would make a client occupy BOTH panels
 * and instantly hit the "room full" guard.
 */
const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:5000';

export const socket = io(SERVER_URL, {
  autoConnect: false, // we connect explicitly after the user joins a room
  withCredentials: true,
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  // Start with long-polling and upgrade to WebSocket. Starting with a raw
  // WebSocket fails on restrictive networks/proxies and has no fallback.
  transports: ['polling', 'websocket'],
  // Socket.io 4.8+: if the first transport fails, try the remaining ones.
  tryAllTransports: true,
});
