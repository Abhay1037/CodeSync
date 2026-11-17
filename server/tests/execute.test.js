import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { setupDB, teardownDB } from './helpers/db.js';

let app;

before(async () => {
  await setupDB();
  const { createApp } = await import('../src/app.js');
  app = createApp();
});

after(async () => {
  await teardownDB();
});

test('rejects empty code and unknown languages', async () => {
  const empty = await request(app).post('/api/execute').send({ language: 'javascript', code: '   ' });
  assert.equal(empty.status, 400);

  const unknown = await request(app)
    .post('/api/execute')
    .send({ language: 'brainfuck', code: '+++' });
  assert.equal(unknown.status, 400);
});

test('rejects payloads over the size limit', async () => {
  const huge = await request(app)
    .post('/api/execute')
    .send({ language: 'javascript', code: 'x'.repeat(150_000) });
  assert.equal(huge.status, 413);
});

test('runs JavaScript and returns stdout + exit code', async () => {
  const res = await request(app)
    .post('/api/execute')
    .set('Content-Type', 'application/json')
    .send({
      language: 'javascript',
      code: 'const [a, b] = process.argv.slice(2); console.log("sum=" + (2 + 3));',
    });

  assert.equal(res.status, 200);
  assert.equal(res.body.exitCode, 0);
  assert.match(res.body.stdout, /sum=5/);
});

test('surfaces runtime errors without failing the request', async () => {
  const res = await request(app)
    .post('/api/execute')
    .send({ language: 'javascript', code: 'throw new Error("boom");' });

  assert.equal(res.status, 200);
  assert.match(res.body.stderr, /boom/);
  assert.notEqual(res.body.exitCode, 0);
});

test('never leaks server secrets into the child environment', async () => {
  const res = await request(app)
    .post('/api/execute')
    .send({
      language: 'javascript',
      code: `
        const keys = Object.keys(process.env);
        console.log(keys.join(','));
        console.log('SECRET=' + (process.env.JWT_SECRET ?? 'undefined'));
        console.log('MONGO=' + (process.env.MONGO_URI ?? 'undefined'));
      `,
    });

  assert.equal(res.status, 200);
  assert.doesNotMatch(res.body.stdout, /codesync-test-secret/);
  assert.doesNotMatch(res.body.stdout, /mongodb:\/\//);
  assert.match(res.body.stdout, /SECRET=undefined/);
});

test('HTML is reported as a browser concern instead of executed', async () => {
  const res = await request(app)
    .post('/api/execute')
    .send({ language: 'html', code: '<h1>hi</h1>' });

  assert.equal(res.status, 200);
  assert.equal(res.body.html, true);
  assert.equal(res.body.exitCode, 0);
});
