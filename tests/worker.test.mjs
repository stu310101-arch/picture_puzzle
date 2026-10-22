import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../optional-short-links/worker.mjs';

function environment() {
  const records = new Map();
  return { records, ALLOWED_ORIGIN: 'https://tester.github.io',
    CREATE_LIMITER: { limit: async () => ({ success: true }) },
    PUZZLES: { put: async (key, value, opts) => { assert.equal(opts.expirationTtl, 2592000); records.set(key, JSON.parse(value)); }, get: async key => records.get(key) }
  };
}
function request(path = '/p', method = 'POST', payload = { v: 1, title: '夏天', count: 24, demo: true }, origin = 'https://tester.github.io') {
  return new Request(`https://api.example${path}`, { method, headers: { Origin: origin, 'Content-Type': 'application/json' }, ...(method === 'POST' ? { body: JSON.stringify(payload) } : {}) });
}
test('short-link API stores, retrieves, and expires the same puzzle', async () => {
  const env = environment(), created = await worker.fetch(request(), env);
  assert.equal(created.status, 201);
  const { id } = await created.json(); assert.match(id, /^[A-Za-z0-9_-]{12}$/);
  const response = await worker.fetch(request(`/p/${id}`, 'GET'), env);
  assert.deepEqual(await response.json(), { v: 1, title: '夏天', count: 24, demo: true });
  env.records.get(id).expiresAt = 0;
  assert.equal((await worker.fetch(request(`/p/${id}`, 'GET'), env)).status, 404);
});
test('short-link API rejects other origins, oversized data and invalid records', async () => {
  const env = environment();
  assert.equal((await worker.fetch(request('/p', 'POST', {}, 'https://other.example'), env)).status, 403);
  assert.equal((await worker.fetch(request('/p', 'POST', { text: 'x'.repeat(160000) }), env)).status, 413);
  assert.equal((await worker.fetch(request('/p', 'POST', { v: 1, title: 'x', count: 1, demo: true }), env)).status, 400);
  assert.equal((await worker.fetch(request('/p', 'OPTIONS'), env)).status, 204);
});
test('short-link API respects rate limits and handles unavailable storage', async () => {
  const env = environment();
  env.CREATE_LIMITER.limit = async () => ({ success: false });
  assert.equal((await worker.fetch(request(), env)).status, 429);
  env.CREATE_LIMITER.limit = async () => ({ success: true });
  env.PUZZLES.put = async () => { throw new Error('Offline'); };
  assert.equal((await worker.fetch(request(), env)).status, 503);
});
