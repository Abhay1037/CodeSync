import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { clearDB, setupDB, teardownDB } from './helpers/db.js';

let app;

const validUser = (suffix = '') => ({
  username: `alice${suffix}`,
  email: `alice${suffix}@test.dev`,
  password: 'secret123',
});

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

test('register validates username, email and password', async () => {
  const noEmail = await request(app)
    .post('/api/auth/register')
    .send({ username: 'alice', password: 'secret123' });
  assert.equal(noEmail.status, 400);

  const shortPassword = await request(app)
    .post('/api/auth/register')
    .send({ username: 'alice', email: 'alice@test.dev', password: '123' });
  assert.equal(shortPassword.status, 400);

  const shortName = await request(app)
    .post('/api/auth/register')
    .send({ username: 'a', email: 'a@test.dev', password: 'secret123' });
  assert.equal(shortName.status, 400);
});

test('register returns a token and never the password hash', async () => {
  const res = await request(app).post('/api/auth/register').send(validUser());

  assert.equal(res.status, 201);
  assert.equal(typeof res.body.token, 'string');
  assert.equal(res.body.user.username, 'alice');
  assert.equal(res.body.user.passwordHash, undefined);
  assert.equal(res.body.user.email, 'alice@test.dev');
});

test('register rejects a duplicate email or username', async () => {
  await request(app).post('/api/auth/register').send(validUser()).expect(201);

  const sameEmail = await request(app)
    .post('/api/auth/register')
    .send({ ...validUser(), username: 'alice2' });
  assert.equal(sameEmail.status, 409);

  const sameName = await request(app)
    .post('/api/auth/register')
    .send({ ...validUser(), email: 'other@test.dev' });
  assert.equal(sameName.status, 409);
});

test('login rejects a bad password and accepts the right one', async () => {
  await request(app).post('/api/auth/register').send(validUser()).expect(201);

  const wrong = await request(app)
    .post('/api/auth/login')
    .send({ email: 'alice@test.dev', password: 'nope123' });
  assert.equal(wrong.status, 401);
  assert.equal(wrong.body.token, undefined);

  const right = await request(app)
    .post('/api/auth/login')
    .send({ email: 'alice@test.dev', password: 'secret123' });
  assert.equal(right.status, 200);
  assert.equal(typeof right.body.token, 'string');
});

test('/api/auth/me requires a valid bearer token', async () => {
  const { body } = await request(app).post('/api/auth/register').send(validUser());

  await request(app).get('/api/auth/me').expect(401);
  await request(app).get('/api/auth/me').set('Authorization', 'Bearer nope').expect(401);

  const me = await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${body.token}`)
    .expect(200);
  assert.equal(me.body.user.username, 'alice');
});
