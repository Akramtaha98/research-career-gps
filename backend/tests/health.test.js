process.env.DEMO_MODE = 'true';
process.env.JWT_SECRET = 'test-secret-health';
process.env.ENABLE_SNAPSHOT_CRON = 'false';
process.env.ENABLE_DIGEST_CRON = 'false';

const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const app = require('../server');

test('GET /health reports ok + demo mode', async () => {
  const res = await request(app).get('/health');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.status, 'ok');
  assert.strictEqual(res.body.demoMode, true);
  assert.ok(res.body.timestamp);
});

test('unknown route returns a JSON 404, not an HTML error page', async () => {
  const res = await request(app).get('/api/this-route-does-not-exist');
  assert.strictEqual(res.status, 404);
  assert.strictEqual(res.body.error, 'Not found');
});
