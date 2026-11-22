import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePistonApiUrl } from '../src/config/env.js';

test('normalises Piston API URLs without inventing public defaults', () => {
  assert.equal(normalizePistonApiUrl(''), '');
  assert.equal(normalizePistonApiUrl('   '), '');

  assert.equal(normalizePistonApiUrl('http://localhost:2000'), 'http://localhost:2000/api/v2');
  assert.equal(normalizePistonApiUrl('http://localhost:2000/'), 'http://localhost:2000/api/v2');
  assert.equal(normalizePistonApiUrl('http://localhost:2000/api/v2'), 'http://localhost:2000/api/v2');
  assert.equal(normalizePistonApiUrl('http://localhost:2000/api/v2/'), 'http://localhost:2000/api/v2');
  assert.equal(
    normalizePistonApiUrl('http://localhost:2000/api/v2/execute'),
    'http://localhost:2000/api/v2'
  );
  assert.equal(
    normalizePistonApiUrl('https://runner.example.com/api/v2/piston/'),
    'https://runner.example.com/api/v2/piston'
  );
});
