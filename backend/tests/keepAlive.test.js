process.env.DEMO_MODE = 'true';
process.env.JWT_SECRET = 'test-secret-keepalive';
process.env.ENABLE_SNAPSHOT_CRON = 'false';
process.env.ENABLE_DIGEST_CRON = 'false';
process.env.ENABLE_KEEP_ALIVE = 'false';

const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const app = require('../server');
const { resolvePublicUrl, touchDatabase, selfPing, startKeepAlive } = require('../services/keepAlive');

test('resolvePublicUrl prefers an explicit PUBLIC_URL and strips a trailing slash', () => {
  const original = { pub: process.env.PUBLIC_URL, rail: process.env.RAILWAY_PUBLIC_DOMAIN };
  process.env.PUBLIC_URL = 'https://api.example.com/';
  process.env.RAILWAY_PUBLIC_DOMAIN = 'ignored.up.railway.app';
  try {
    assert.strictEqual(resolvePublicUrl(), 'https://api.example.com');
  } finally {
    if (original.pub === undefined) delete process.env.PUBLIC_URL;
    else process.env.PUBLIC_URL = original.pub;
    if (original.rail === undefined) delete process.env.RAILWAY_PUBLIC_DOMAIN;
    else process.env.RAILWAY_PUBLIC_DOMAIN = original.rail;
  }
});

test("resolvePublicUrl builds an https URL from Railway's injected domain when PUBLIC_URL is unset", () => {
  const original = { pub: process.env.PUBLIC_URL, rail: process.env.RAILWAY_PUBLIC_DOMAIN };
  delete process.env.PUBLIC_URL;
  process.env.RAILWAY_PUBLIC_DOMAIN = 'research-gps.up.railway.app';
  try {
    assert.strictEqual(resolvePublicUrl(), 'https://research-gps.up.railway.app');
  } finally {
    if (original.pub === undefined) delete process.env.PUBLIC_URL;
    else process.env.PUBLIC_URL = original.pub;
    if (original.rail === undefined) delete process.env.RAILWAY_PUBLIC_DOMAIN;
    else process.env.RAILWAY_PUBLIC_DOMAIN = original.rail;
  }
});

test('resolvePublicUrl returns null locally (neither var set) rather than guessing a URL', () => {
  const original = { pub: process.env.PUBLIC_URL, rail: process.env.RAILWAY_PUBLIC_DOMAIN };
  delete process.env.PUBLIC_URL;
  delete process.env.RAILWAY_PUBLIC_DOMAIN;
  try {
    assert.strictEqual(resolvePublicUrl(), null);
  } finally {
    if (original.pub !== undefined) process.env.PUBLIC_URL = original.pub;
    if (original.rail !== undefined) process.env.RAILWAY_PUBLIC_DOMAIN = original.rail;
  }
});

test('selfPing reports skipped (never throws) when there is no public URL to ping', async () => {
  const original = { pub: process.env.PUBLIC_URL, rail: process.env.RAILWAY_PUBLIC_DOMAIN };
  delete process.env.PUBLIC_URL;
  delete process.env.RAILWAY_PUBLIC_DOMAIN;
  try {
    const result = await selfPing();
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.skipped, true);
  } finally {
    if (original.pub !== undefined) process.env.PUBLIC_URL = original.pub;
    if (original.rail !== undefined) process.env.RAILWAY_PUBLIC_DOMAIN = original.rail;
  }
});

test('selfPing resolves (does not reject) when the ping target is unreachable', async () => {
  const original = process.env.PUBLIC_URL;
  // Reserved TEST-NET-1 address (RFC 5737) — guaranteed non-routable, so
  // this exercises the failure path without depending on a real network.
  process.env.PUBLIC_URL = 'http://192.0.2.1:9';
  try {
    const result = await selfPing();
    assert.strictEqual(result.ok, false);
    assert.ok(result.reason, 'a failed ping should explain itself rather than throwing');
  } finally {
    if (original === undefined) delete process.env.PUBLIC_URL;
    else process.env.PUBLIC_URL = original;
  }
});

test('touchDatabase skips cleanly in demo mode instead of erroring on a missing pool', async () => {
  const result = await touchDatabase();
  assert.strictEqual(result.skipped, true);
  assert.match(result.reason, /demo mode/i);
});

test('startKeepAlive honours ENABLE_KEEP_ALIVE=false without scheduling anything', () => {
  // Would throw if it tried to schedule against a missing pool / bad cron.
  assert.doesNotThrow(() => startKeepAlive());
});

test('GET /health stays dependency-free and reports uptime', async () => {
  const res = await request(app).get('/health');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.status, 'ok');
  assert.strictEqual(typeof res.body.uptimeSeconds, 'number');
});

test('GET /ready reports ok and skips the DB check in demo mode', async () => {
  const res = await request(app).get('/ready');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.status, 'ok');
  assert.match(res.body.database, /skipped/i);
});
