import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { clearDB, setupDB, teardownDB } from './helpers/db.js';

let app;

async function signup(name) {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ username: name, email: `${name}@test.dev`, password: 'secret123' });
  assert.equal(res.status, 201, `signup failed: ${JSON.stringify(res.body)}`);
  return { token: res.body.token, id: res.body.user.id };
}

const auth = (token) => ({ Authorization: `Bearer ${token}` });

before(async () => {
  await setupDB();
  const { createApp } = await import('../src/app.js');
  app = createApp();
});

after(async () => {
  await teardownDB();
});

beforeEach(async () => {
  await clearDB();
});

test('creating a room requires authentication', async () => {
  await request(app).post('/api/rooms').send({ roomId: 'abc123' }).expect(401);
});

test('a room can be created with a custom id and starts with seed files', async () => {
  const { token } = await signup('owner1');

  const created = await request(app)
    .post('/api/rooms')
    .set(auth(token))
    .send({ roomId: 'team-room' });
  assert.equal(created.status, 201);
  assert.equal(created.body.room.roomId, 'team-room');

  const fetched = await request(app).get('/api/rooms/team-room').set(auth(token));
  assert.equal(fetched.status, 200);
  assert.ok(fetched.body.room.files.length > 0);
  assert.equal(fetched.body.room.panelFiles.left, 'src/main.js');
});

test('duplicate room ids and unsafe room ids are rejected', async () => {
  const { token } = await signup('owner2');

  await request(app).post('/api/rooms').set(auth(token)).send({ roomId: 'dup-room' }).expect(201);
  const duplicate = await request(app)
    .post('/api/rooms')
    .set(auth(token))
    .send({ roomId: 'dup-room' });
  assert.equal(duplicate.status, 409);

  const unsafe = await request(app)
    .post('/api/rooms')
    .set(auth(token))
    .send({ roomId: '../etc/passwd' });
  assert.equal(unsafe.status, 400);
});

test('the rooms list only contains rooms the user owns or joined', async () => {
  const alice = await signup('alice3');
  const bob = await signup('bob3');

  await request(app).post('/api/rooms').set(auth(alice.token)).send({ roomId: 'alice-room' }).expect(201);
  await request(app).post('/api/rooms').set(auth(bob.token)).send({ roomId: 'bob-room' }).expect(201);

  const aliceRooms = await request(app).get('/api/rooms').set(auth(alice.token)).expect(200);
  const ids = aliceRooms.body.rooms.map((room) => room.roomId);
  assert.deepEqual(ids, ['alice-room']);
});

test('reading a room is private to its members', async () => {
  const alice = await signup('alice4');
  const bob = await signup('bob4');

  await request(app).post('/api/rooms').set(auth(alice.token)).send({ roomId: 'private-room' }).expect(201);

  await request(app).get('/api/rooms/private-room').expect(401);
  const outsider = await request(app)
    .get('/api/rooms/private-room')
    .set(auth(bob.token));
  assert.equal(outsider.status, 403);
  assert.equal(outsider.body.room, undefined);

  await request(app).get('/api/rooms/private-room').set(auth(alice.token)).expect(200);
  await request(app).get('/api/rooms/does-not-exist').set(auth(alice.token)).expect(404);
});

test('only the owner can delete a room', async () => {
  const alice = await signup('alice5');
  const bob = await signup('bob5');

  await request(app).post('/api/rooms').set(auth(alice.token)).send({ roomId: 'delete-me' }).expect(201);

  const outsider = await request(app)
    .delete('/api/rooms/delete-me')
    .set(auth(bob.token));
  assert.equal(outsider.status, 403);

  await request(app).delete('/api/rooms/delete-me').set(auth(alice.token)).expect(200);
  await request(app).get('/api/rooms/delete-me').set(auth(alice.token)).expect(404);
});
