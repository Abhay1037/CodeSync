import { io } from 'socket.io-client';

const URL = process.env.SMOKE_URL ?? 'http://localhost:5000';
const a = io(URL, { transports: ['websocket'] });
const b = io(URL, { transports: ['websocket'] });

const waitEvent = (socket, event) => new Promise((resolve) => socket.once(event, resolve));
const emitAck = (socket, event, payload) =>
  new Promise((resolve) => socket.emit(event, payload, resolve));

await Promise.all([waitEvent(a, 'connect'), waitEvent(b, 'connect')]);

const roomId = `smoke-${Date.now()}`;
const joinA = await emitAck(a, 'room:join', { roomId, username: 'A' });
const joinB = await emitAck(b, 'room:join', { roomId, username: 'B' });
console.log('join:', joinA.ok, joinA.role, '|', joinB.ok, joinB.role, '| files', joinA.state.files.length);

const created = await emitAck(a, 'file:create', { path: 'tmp/hello.jsx' });
console.log('create:', created.ok, created.file?.path);

const renamedEvent = waitEvent(b, 'file:renamed');
const renamed = await emitAck(a, 'file:rename', { fileId: created.file.id, path: 'tmp/renamed.py' });
const renamedPayload = await renamedEvent;
console.log(
  'rename:',
  renamed.ok,
  renamed.file?.path,
  '| language',
  renamed.file?.language,
  '| partner event',
  renamedPayload.file?.path
);

const duplicate = await emitAck(a, 'file:rename', { fileId: created.file.id, path: 'src/main.js' });
console.log('rename clash blocked:', duplicate.ok === false, duplicate.reason);

const deletedEvent = waitEvent(b, 'file:deleted');
const deleted = await emitAck(a, 'file:delete', { fileId: created.file.id });
const deletedPayload = await deletedEvent;
console.log(
  'delete:',
  deleted.ok,
  '| partner event',
  deletedPayload.fileId === created.file.id,
  '| panels',
  JSON.stringify(deleted.panelFiles)
);

const remaining = joinA.state.files.filter((file) => file.id !== created.file.id);
let lastFileReason = null;
for (const file of remaining) {
  const res = await emitAck(a, 'file:delete', { fileId: file.id });
  if (!res.ok) lastFileReason = res.reason;
}
console.log('last-file guard:', lastFileReason);

a.close();
b.close();
process.exit(0);
