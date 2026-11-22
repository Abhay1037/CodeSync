import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import request from 'supertest';

/**
 * Exercises the configured remote runner. These tests do not use the local
 * child-process fallback, so they cover the production-style execution path.
 */
let app;
let createApp;
let env;
let mockServer;
let lastRequest;
let mode = 'ok';

const RUNNER_KEY = 'runner-key-that-must-never-reach-the-browser';

before(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'codesync-test-secret';
  process.env.ALLOW_LOCAL_EXEC = 'false';
  process.env.PISTON_API_KEY = RUNNER_KEY;

  mockServer = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      lastRequest = {
        url: req.url,
        headers: req.headers,
        body: raw ? JSON.parse(raw) : null,
      };

      if (mode === 'unauthorized') {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end('{"message":"Public Piston API is now whitelist only as of 2/15/2026."}');
      }

      if (mode === 'invalid') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        return res.end('not json');
      }

      if (mode === 'hang') {
        // Simulate a runner that accepts the request but never responds.
        req.on('aborted', () => res.destroy());
        return setTimeout(() => {
          if (!res.writableEnded) res.destroy();
        }, 500);
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      if (mode === 'compile-error') {
        return res.end(
          JSON.stringify({
            compile: {
              stdout: '',
              stderr: 'Main.java:3: error: cannot find symbol',
              code: 1,
              signal: null,
            },
          })
        );
      }

      if (mode === 'runtime-error') {
        return res.end(
          JSON.stringify({
            run: {
              stdout: 'before\n',
              stderr: 'Exception in thread "main" java.lang.RuntimeException: boom',
              output: 'before\nException in thread "main" java.lang.RuntimeException: boom',
              code: 1,
              signal: null,
            },
          })
        );
      }

      const stdout = `Hello, ${String(lastRequest.body.stdin).trim()}\n`;
      res.end(
        JSON.stringify({
          run: {
            stdout,
            stderr: '',
            output: stdout,
            code: 0,
            signal: null,
          },
        })
      );
    });
  });

  await new Promise((resolve) => mockServer.listen(0, '127.0.0.1', resolve));
  process.env.PISTON_API_URL = `http://127.0.0.1:${mockServer.address().port}/api/v2`;

  ({ createApp } = await import('../src/app.js'));
  ({ env } = await import('../src/config/env.js'));
  app = createApp();
});

after(async () => {
  await new Promise((resolve) => mockServer.close(resolve));
});

test('posts to PISTON_API_URL and forwards language, filename and stdin', async () => {
  mode = 'ok';

  const res = await request(app)
    .post('/api/execute')
    .send({ language: 'python', code: 'print("Hello," + input())', stdin: ' Ada' });

  assert.equal(res.status, 200);
  assert.equal(lastRequest.url, '/api/v2/execute');
  assert.equal(lastRequest.body.language, 'python');
  assert.equal(lastRequest.body.files[0].name, 'main.py');
  assert.equal(lastRequest.body.stdin, ' Ada');
  assert.equal(lastRequest.headers.authorization, `Bearer ${RUNNER_KEY}`);
  assert.equal(res.body.stdout, 'Hello, Ada\n');
  assert.doesNotMatch(JSON.stringify(res.body), /127\.0\.0\.1|api\/v2|runner-key/);
});

test('names Java files after the public class and surfaces compile errors', async () => {
  mode = 'compile-error';

  const res = await request(app).post('/api/execute').send({
    language: 'java',
    code: 'public class Main { public static void main(String[] a) {} }',
  });

  assert.equal(res.status, 200);
  // Piston's Java runtime appends ".java" to the stem itself.
  assert.equal(lastRequest.body.files[0].name, 'Main');
  assert.match(res.body.stderr, /cannot find symbol/);
  assert.equal(res.body.exitCode, 1);
});

test('passes JavaScript runtime and stdin through to Piston', async () => {
  mode = 'ok';

  const res = await request(app).post('/api/execute').send({
    language: 'javascript',
    code: 'console.log("echo:" + require("fs").readFileSync(0, "utf8"))',
    stdin: 'JS-INPUT',
  });

  assert.equal(res.status, 200);
  assert.equal(lastRequest.body.language, 'javascript');
  assert.equal(lastRequest.body.files[0].name, 'main.js');
  assert.equal(lastRequest.body.stdin, 'JS-INPUT');
  assert.equal(res.body.stdout, 'Hello, JS-INPUT\n');
});

test('passes Java runtime and stdin through and surfaces runtime errors', async () => {
  mode = 'runtime-error';

  const res = await request(app).post('/api/execute').send({
    language: 'java',
    code: 'public class Main { public static void main(String[] a) { throw new RuntimeException("boom"); } }',
    stdin: 'java-input',
  });

  assert.equal(res.status, 200);
  assert.equal(lastRequest.body.language, 'java');
  assert.equal(lastRequest.body.files[0].name, 'Main');
  assert.equal(lastRequest.body.stdin, 'java-input');
  assert.equal(res.body.stdout, 'before\n');
  assert.match(res.body.stderr, /RuntimeException: boom/);
  assert.equal(res.body.exitCode, 1);
});

test('enforces PISTON_TIMEOUT_MS while waiting for the runner', async () => {
  mode = 'hang';
  const original = env.pistonTimeoutMs;
  env.pistonTimeoutMs = 50;

  try {
    const res = await request(app)
      .post('/api/execute')
      .send({ language: 'javascript', code: 'console.log(1)' });

    assert.equal(res.status, 504);
    assert.match(res.body.error, /timed out/i);
  } finally {
    env.pistonTimeoutMs = original;
    mode = 'ok';
  }
});

test('replaces runner 401 text with a safe client message', async () => {
  mode = 'unauthorized';

  const res = await request(app)
    .post('/api/execute')
    .send({ language: 'python', code: 'print(1)' });

  assert.equal(res.status, 502);
  assert.match(res.body.error, /authentication failed/i);
  assert.doesNotMatch(res.body.error, /whitelist only|127\.0\.0\.1|api\/v2|runner-key/);
});

test('reports a clear error when no execution server is configured', async () => {
  const original = env.pistonApiUrl;
  env.pistonApiUrl = '';

  try {
    const res = await request(app)
      .post('/api/execute')
      .send({ language: 'python', code: 'print(1)' });

    assert.equal(res.status, 503);
    assert.match(res.body.error, /not configured/i);
    assert.doesNotMatch(res.body.error, /127\.0\.0\.1|api\/v2|runner-key/);
  } finally {
    env.pistonApiUrl = original;
  }
});

test('reports a clear error when the execution server is unreachable', async () => {
  const original = env.pistonApiUrl;
  env.pistonApiUrl = 'http://127.0.0.1:1/api/v2';

  try {
    const res = await request(app)
      .post('/api/execute')
      .send({ language: 'python', code: 'print(1)' });

    assert.equal(res.status, 502);
    assert.match(res.body.error, /unavailable/i);
    assert.doesNotMatch(res.body.error, /127\.0\.0\.1|api\/v2|runner-key/);
  } finally {
    env.pistonApiUrl = original;
  }
});
