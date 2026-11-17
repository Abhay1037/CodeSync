import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { clearDB, setupDB, teardownDB } from './helpers/db.js';
import {
  connectClient,
  delay,
  emitAck,
  nextEvent,
  startTestServer,
} from './helpers/socket.js';

let server;
let clients = [];
let roomSeq = 0;

const nextRoomId = () => `room-${Date.now()}-${roomSeq++}`;

async function connect() {
  const client = await connectClient(server.url);
  clients.push(client);
  return client;
}

async function seatPair(roomId) {
  const left = await connect();
  const right = await connect();
  const leftJoin = await emitAck(left, 'room:join', { roomId, username: 'Left' });
  const rightJoin = await emitAck(right, 'room:join', { roomId, username: 'Right' });
  assert.equal(leftJoin.ok, true);
  assert.equal(rightJoin.ok, true);
  assert.equal(leftJoin.role, 'left');
  assert.equal(rightJoin.role, 'right');
  return { left, right, leftJoin, rightJoin };
}

before(async () => {
  await setupDB();
  server = await startTestServer();
});

after(async () => {
  clients.forEach((client) => client.close());
  await server.close();
  await teardownDB();
});

beforeEach(async () => {
  clients.forEach((client) => client.close());
  clients = [];
  await clearDB();
});

test('seats two editors and rejects a third join', async () => {
  const roomId = nextRoomId();
  const { leftJoin } = await seatPair(roomId);

  assert.equal(leftJoin.state.users.length, 1);
  assert.ok(leftJoin.state.files.length > 0);

  const third = await connect();
  const roomFull = nextEvent(third, 'room:full');
  const res = await emitAck(third, 'room:join', { roomId, username: 'Third' });

  assert.equal(res.ok, false);
  assert.equal(res.reason, 'ROOM_FULL');
  const payload = await roomFull;
  assert.equal(payload.roomId, roomId);
});

test('server enforces panel ownership for code changes', async () => {
  const roomId = nextRoomId();
  const { left, right } = await seatPair(roomId);

  let partnerUpdates = 0;
  right.on('code:update', () => {
    partnerUpdates += 1;
  });

  // The left editor tries to type into the right panel: rejected.
  const errorMessage = nextEvent(left, 'error:message');
  left.emit('code:change', { panel: 'right', fileId: 'src/utils.js', code: 'hacked' });
  const error = await errorMessage;
  assert.match(error.message, /only edit the left panel/i);

  await delay(150);
  assert.equal(partnerUpdates, 0, 'partner must not receive a blocked edit');

  // Typing in the owned panel is relayed to the partner.
  const update = nextEvent(right, 'code:update');
  left.emit('code:change', { panel: 'left', fileId: 'src/main.js', code: 'console.log("ok");' });
  const payload = await update;

  assert.equal(payload.panel, 'left');
  assert.equal(payload.fileId, 'src/main.js');
  assert.equal(payload.code, 'console.log("ok");');
  assert.equal(partnerUpdates, 1);
});

test('rejects edits to a file that is not open in the sender panel', async () => {
  const roomId = nextRoomId();
  const { left } = await seatPair(roomId);

  const errorMessage = nextEvent(left, 'error:message');
  left.emit('code:change', { panel: 'left', fileId: 'src/styles.css', code: 'x' });
  const error = await errorMessage;
  assert.match(error.message, /open that file in your panel/i);
});

test('creating, renaming and deleting a file is broadcast to the partner', async () => {
  const roomId = nextRoomId();
  const { left, right } = await seatPair(roomId);

  // --- create -----------------------------------------------------------
  const createdEvent = nextEvent(right, 'file:created');
  const created = await emitAck(left, 'file:create', { path: 'docs/note.md' });
  assert.equal(created.ok, true);
  assert.equal(created.file.path, 'docs/note.md');
  assert.equal(created.file.language, 'markdown');
  const createdPayload = await createdEvent;
  assert.equal(createdPayload.file.path, 'docs/note.md');
  assert.equal(createdPayload.panel, 'left');

  // --- rename (id stays stable, language is recalculated) ----------------
  const renamedEvent = nextEvent(right, 'file:renamed');
  const renamed = await emitAck(left, 'file:rename', {
    fileId: created.file.id,
    path: 'docs/note.js',
  });
  assert.equal(renamed.ok, true);
  assert.equal(renamed.file.id, created.file.id);
  assert.equal(renamed.file.path, 'docs/note.js');
  assert.equal(renamed.file.language, 'javascript');
  const renamedPayload = await renamedEvent;
  assert.equal(renamedPayload.file.path, 'docs/note.js');

  // Renaming onto an existing path must fail.
  const clash = await emitAck(left, 'file:rename', {
    fileId: created.file.id,
    path: 'src/main.js',
  });
  assert.equal(clash.ok, false);
  assert.equal(clash.reason, 'FILE_EXISTS');

  // --- delete -----------------------------------------------------------
  const deletedEvent = nextEvent(right, 'file:deleted');
  const deleted = await emitAck(left, 'file:delete', { fileId: created.file.id });
  assert.equal(deleted.ok, true);
  const deletedPayload = await deletedEvent;
  assert.equal(deletedPayload.fileId, created.file.id);
  // The left panel had the deleted file open, so it falls back to a seed file.
  assert.equal(deleted.panelFiles.left, 'src/main.js');
});

test('a room always keeps at least one file', async () => {
  const roomId = nextRoomId();
  const { left, leftJoin } = await seatPair(roomId);

  const keep = leftJoin.state.files[0];
  for (const file of leftJoin.state.files.slice(1)) {
    const res = await emitAck(left, 'file:delete', { fileId: file.id });
    assert.equal(res.ok, true);
  }

  const last = await emitAck(left, 'file:delete', { fileId: keep.id });
  assert.equal(last.ok, false);
  assert.equal(last.reason, 'LAST_FILE');
});

test('file paths are validated server-side', async () => {
  const roomId = nextRoomId();
  const { left } = await seatPair(roomId);

  const traversal = await emitAck(left, 'file:create', { path: '../escape.js' });
  assert.equal(traversal.ok, false);
  assert.equal(traversal.reason, 'INVALID_PATH');

  const deep = await emitAck(left, 'file:create', { path: 'a/b/c/d/e/f/g/h/i/j.js' });
  assert.equal(deep.ok, false);
  assert.equal(deep.reason, 'INVALID_PATH');
});
