import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import request from 'supertest';
import { clearDB, setupDB, teardownDB } from './helpers/db.js';
import { resetRateLimits } from '../src/middleware/rateLimit.js';
import { EVENTS } from '../src/constants/events.js';
import { registerSocketHandlers } from '../src/sockets/socketHandler.js';
import { ensureRoom, getRoomAccess } from '../src/services/roomService.js';

let app;
let env;
let hydrateRoom;
let joinRoom;
let getRoom;
let saveFilesDebounced;

const auth = (token) => ({ Authorization: `Bearer ${token}` });

before(async () => {
  await setupDB();
  const appModule = await import('../src/app.js');
  app = appModule.createApp();
  env = (await import('../src/config/env.js')).env;
  ({ hydrateRoom, joinRoom, getRoom } = await import('../src/sockets/roomStore.js'));
  ({ saveFilesDebounced } = await import('../src/services/roomService.js'));
});

after(async () => {
  await teardownDB();
});

beforeEach(async () => {
  await clearDB();
  resetRateLimits();
});

async function signup(name) {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ username: name, email: `${name}@test.dev`, password: 'secret123' });
  assert.equal(res.status, 201, `signup failed: ${JSON.stringify(res.body)}`);
  return { token: res.body.token, id: res.body.user.id };
}

test('CORS preflight allows DELETE so owners can delete rooms', async () => {
  const res = await request(app)
    .options('/api/rooms/some-room')
    .set('Origin', 'http://localhost:5173')
    .set('Access-Control-Request-Method', 'DELETE')
    .expect(204);

  assert.match(res.headers['access-control-allow-methods'] ?? '', /DELETE/);
});

test('public endpoints advertise rate-limit headers', async () => {
  const res = await request(app)
    .post('/api/execute')
    .send({ language: 'javascript', code: '' });

  assert.equal(res.status, 400);
  assert.equal(res.headers['x-ratelimit-limit'], String(env.executeRateLimitMax));
  assert.match(res.headers['x-ratelimit-remaining'] ?? '', /^\d+$/);
});

test('excessive executions are rejected with 429', async () => {
  const attempts = env.executeRateLimitMax + 1;
  let last;

  for (let i = 0; i < attempts; i += 1) {
    last = await request(app)
      .post('/api/execute')
      .send({ language: 'javascript', code: '' });
  }

  assert.equal(last.status, 429);
  assert.match(last.body.error ?? '', /too many/i);
  assert.match(last.headers['retry-after'] ?? '', /^\d+$/);
});

test('deleting a room also evicts its realtime hot-cache entry', async () => {
  const owner = await signup('cacheowner');

  await request(app)
    .post('/api/rooms')
    .set(auth(owner.token))
    .send({ roomId: 'cache-room' })
    .expect(201);

  hydrateRoom('cache-room', {
    files: [
      {
        id: 'src/main.js',
        name: 'main.js',
        path: 'src/main.js',
        folder: 'src',
        language: 'javascript',
        content: 'console.log(1)',
      },
    ],
    panelFiles: { left: 'src/main.js', right: 'src/main.js' },
  });
  joinRoom({ roomId: 'cache-room', socketId: 'fake-socket', username: 'cacheowner' });
  assert.ok(getRoom('cache-room'), 'room should be in the hot cache before delete');

  const cached = getRoom('cache-room');
  saveFilesDebounced('cache-room', cached.files, cached.panelFiles);

  await request(app)
    .delete('/api/rooms/cache-room')
    .set(auth(owner.token))
    .expect(200);

  assert.equal(getRoom('cache-room'), null, 'deleted room must not stay cached');

  await request(app)
    .get('/api/rooms/cache-room')
    .set(auth(owner.token))
    .expect(404);
});

test('a rejected third joiner is not persisted as a room member', async () => {
  const owner = await signup('roomowner');
  const third = await signup('thirduser');

  await request(app)
    .post('/api/rooms')
    .set(auth(owner.token))
    .send({ roomId: 'full-room' })
    .expect(201);

  hydrateRoom('full-room', {
    files: [
      {
        id: 'src/main.js',
        name: 'main.js',
        path: 'src/main.js',
        folder: 'src',
        language: 'javascript',
        content: '',
      },
    ],
    panelFiles: { left: 'src/main.js', right: 'src/main.js' },
  });
  joinRoom({ roomId: 'full-room', socketId: 'seat-left', username: 'one' });
  joinRoom({ roomId: 'full-room', socketId: 'seat-right', username: 'two' });
  await ensureRoom({ roomId: 'full-room', ownerId: owner.id });

  const socket = new EventEmitter();
  socket.id = 'third-socket';
  socket.data = { user: { id: third.id, username: 'thirduser' } };
  socket.join = () => {};
  socket.to = () => ({ emit: () => {} });
  registerSocketHandlers({ to: () => ({ emit: () => {} }) }, socket);

  const ack = await new Promise((resolve) => {
    const handler = socket.listeners(EVENTS.ROOM_JOIN)[0];
    handler({ roomId: 'full-room', username: 'thirduser' }, resolve);
  });

  assert.equal(ack.ok, false);
  assert.equal(ack.reason, 'ROOM_FULL');

  const access = await getRoomAccess('full-room', third.id);
  assert.equal(access.found, true);
  assert.equal(access.member, false, 'rejected joiner must not gain private read access');
});
