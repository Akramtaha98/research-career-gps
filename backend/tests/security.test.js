process.env.DEMO_MODE = 'true';
process.env.JWT_SECRET = 'test-secret-security';
process.env.ENABLE_SNAPSHOT_CRON = 'false';
process.env.ENABLE_DIGEST_CRON = 'false';
// Deliberately NOT setting DISABLE_RATE_LIMIT here -- this file exists
// specifically to prove the limiter is live by default.

const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const app = require('../server');

test('helmet security headers are present on every response', async () => {
  const res = await request(app).get('/health');
  assert.strictEqual(res.headers['x-content-type-options'], 'nosniff');
  assert.strictEqual(res.headers['x-dns-prefetch-control'], 'off');
  assert.ok(res.headers['x-frame-options']);
  assert.strictEqual(res.headers['x-powered-by'], undefined, 'helmet should strip X-Powered-By');
  // API-only backend -- CSP is intentionally off (see server.js), and CORP
  // must allow cross-origin reads since the frontend lives on a different
  // origin (Vercel) than this API (Railway).
  assert.strictEqual(res.headers['cross-origin-resource-policy'], 'cross-origin');
});

test('the shared auth rate limiter blocks after its configured max, per IP', async () => {
  // authLimiter's max is 20 requests / 15 min, shared across every
  // auth-sensitive route. Hammer a cheap one (forgot-password, always 200,
  // no side effect worth asserting beyond the limiter kicking in) until it
  // trips.
  let sawBlocked = false;
  let lastStatus = null;
  for (let i = 0; i < 25; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const res = await request(app).post('/api/auth/forgot-password').send({ email: `flood-${i}@example.com` });
    lastStatus = res.status;
    if (res.status === 429) {
      sawBlocked = true;
      break;
    }
  }
  assert.ok(sawBlocked, `expected a 429 within 25 requests, last status was ${lastStatus}`);
});

test('an unrelated, non-rate-limited route stays available while the auth bucket is exhausted', async () => {
  const res = await request(app).get('/health');
  assert.strictEqual(res.status, 200);
});
