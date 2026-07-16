process.env.DEMO_MODE = 'true';
process.env.JWT_SECRET = 'test-secret-auth';
process.env.ENABLE_SNAPSHOT_CRON = 'false';
process.env.ENABLE_DIGEST_CRON = 'false';
process.env.FRONTEND_URL = 'http://localhost:5173';
// This file makes far more than 20 requests against the shared authLimiter
// bucket (signup/login/forgot-password/reset-password/verify-email/resend-
// verification all count against the same per-IP limit) -- see
// tests/rateLimit.test.js for the dedicated test that DISABLE_RATE_LIMIT
// itself works and that the limiter actually blocks at 20 when enabled.
process.env.DISABLE_RATE_LIMIT = 'true';

const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const request = require('supertest');
const app = require('../server');
const store = require('../services/store');

// Unique per test run so re-running this file (or the whole suite) never
// collides with a leftover in-memory user from a previous process.
const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

test('POST /api/auth/signup creates an unverified account and returns a usable token', async () => {
  const email = `signup-${unique()}@example.com`;
  const res = await request(app)
    .post('/api/auth/signup')
    .send({ email, name: 'New User', password: 'password123' });

  assert.strictEqual(res.status, 201);
  assert.ok(res.body.token);
  assert.strictEqual(res.body.user.email, email);
  assert.strictEqual(res.body.user.emailVerified, false, 'local signups must start unverified');
  assert.strictEqual(res.body.user.digestSubscribed, true, 'digest opt-in defaults to true');
  assert.strictEqual(res.body.user.plan, 'free');
});

test('POST /api/auth/signup rejects a short password', async () => {
  const res = await request(app)
    .post('/api/auth/signup')
    .send({ email: `short-${unique()}@example.com`, name: 'X', password: '123' });
  assert.strictEqual(res.status, 400);
});

test('POST /api/auth/signup rejects a duplicate email', async () => {
  const email = `dup-${unique()}@example.com`;
  await request(app).post('/api/auth/signup').send({ email, name: 'A', password: 'password123' });
  const res = await request(app).post('/api/auth/signup').send({ email, name: 'B', password: 'password123' });
  assert.strictEqual(res.status, 409);
});

test('POST /api/auth/login rejects a wrong password, succeeds with the right one', async () => {
  const email = `login-${unique()}@example.com`;
  await request(app).post('/api/auth/signup').send({ email, name: 'Login Test', password: 'correct-password' });

  const wrong = await request(app).post('/api/auth/login').send({ email, password: 'wrong-password' });
  assert.strictEqual(wrong.status, 401);

  const right = await request(app).post('/api/auth/login').send({ email, password: 'correct-password' });
  assert.strictEqual(right.status, 200);
  assert.ok(right.body.token);
});

test('GET /api/auth/me requires a valid bearer token', async () => {
  const noAuth = await request(app).get('/api/auth/me');
  assert.strictEqual(noAuth.status, 401);

  const badAuth = await request(app).get('/api/auth/me').set('Authorization', 'Bearer not-a-real-token');
  assert.strictEqual(badAuth.status, 401);

  const email = `me-${unique()}@example.com`;
  const signup = await request(app).post('/api/auth/signup').send({ email, name: 'Me Test', password: 'password123' });
  const ok = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${signup.body.token}`);
  assert.strictEqual(ok.status, 200);
  assert.strictEqual(ok.body.user.email, email);
});

test('POST /api/auth/verify-email rejects an invalid/expired token', async () => {
  const res = await request(app).post('/api/auth/verify-email').send({ token: 'this-token-does-not-exist' });
  assert.strictEqual(res.status, 400);
});

test('POST /api/auth/verify-email confirms the account for a valid token', async () => {
  const email = `verify-${unique()}@example.com`;
  const signup = await request(app).post('/api/auth/signup').send({ email, name: 'Verify Test', password: 'password123' });
  const userId = signup.body.user.id;
  assert.strictEqual(signup.body.user.emailVerified, false);

  // The raw token only ever exists inside the (best-effort, fire-and-forget)
  // verification email — simulate having received it the same way
  // authController.js#sendVerificationEmailBestEffort generates it, so this
  // test exercises the real verify-email code path end to end without
  // needing an actual mailbox.
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  await store.setEmailVerificationToken(userId, { tokenHash, expiresAt: new Date(Date.now() + 60 * 60 * 1000) });

  const verify = await request(app).post('/api/auth/verify-email').send({ token: rawToken });
  assert.strictEqual(verify.status, 200);
  assert.strictEqual(verify.body.user.emailVerified, true);

  // Token must be single-use.
  const replay = await request(app).post('/api/auth/verify-email').send({ token: rawToken });
  assert.strictEqual(replay.status, 400);
});

test('POST /api/auth/resend-verification requires auth and no-ops once already verified', async () => {
  const noAuth = await request(app).post('/api/auth/resend-verification');
  assert.strictEqual(noAuth.status, 401);

  const email = `resend-${unique()}@example.com`;
  const signup = await request(app).post('/api/auth/signup').send({ email, name: 'Resend Test', password: 'password123' });
  const token = signup.body.token;

  // No RESEND_API_KEY configured in the test environment -- the endpoint
  // must still respond 200 (best-effort send, never surfaces the delivery
  // failure to the client), not crash or 500.
  const res = await request(app).post('/api/auth/resend-verification').set('Authorization', `Bearer ${token}`);
  assert.strictEqual(res.status, 200);

  await store.markEmailVerified(signup.body.user.id);
  const already = await request(app).post('/api/auth/resend-verification').set('Authorization', `Bearer ${token}`);
  assert.strictEqual(already.status, 200);
  assert.match(already.body.message, /already confirmed/i);
});

test('PATCH /api/auth/email-preferences requires auth and toggles digest_subscribed', async () => {
  const noAuth = await request(app).patch('/api/auth/email-preferences').send({ digestSubscribed: false });
  assert.strictEqual(noAuth.status, 401);

  const email = `prefs-${unique()}@example.com`;
  const signup = await request(app).post('/api/auth/signup').send({ email, name: 'Prefs Test', password: 'password123' });
  const token = signup.body.token;
  assert.strictEqual(signup.body.user.digestSubscribed, true);

  const invalid = await request(app)
    .patch('/api/auth/email-preferences')
    .set('Authorization', `Bearer ${token}`)
    .send({ digestSubscribed: 'not-a-boolean' });
  assert.strictEqual(invalid.status, 400);

  const off = await request(app)
    .patch('/api/auth/email-preferences')
    .set('Authorization', `Bearer ${token}`)
    .send({ digestSubscribed: false });
  assert.strictEqual(off.status, 200);
  assert.strictEqual(off.body.user.digestSubscribed, false);

  const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
  assert.strictEqual(me.body.user.digestSubscribed, false);
});

test('POST /api/auth/forgot-password always returns the same generic message', async () => {
  const knownEmail = `forgot-${unique()}@example.com`;
  await request(app).post('/api/auth/signup').send({ email: knownEmail, name: 'Forgot Test', password: 'password123' });

  const forKnown = await request(app).post('/api/auth/forgot-password').send({ email: knownEmail });
  const forUnknown = await request(app).post('/api/auth/forgot-password').send({ email: `nobody-${unique()}@example.com` });

  assert.strictEqual(forKnown.status, 200);
  assert.strictEqual(forUnknown.status, 200);
  assert.strictEqual(forKnown.body.message, forUnknown.body.message);
});

test('POST /api/auth/reset-password rejects an invalid token and accepts a valid one', async () => {
  const email = `reset-${unique()}@example.com`;
  const signup = await request(app).post('/api/auth/signup').send({ email, name: 'Reset Test', password: 'old-password' });
  const userId = signup.body.user.id;

  const badToken = await request(app).post('/api/auth/reset-password').send({ token: 'bogus', password: 'new-password' });
  assert.strictEqual(badToken.status, 400);

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  await store.setResetToken(userId, { tokenHash, expiresAt: new Date(Date.now() + 60 * 60 * 1000) });

  const reset = await request(app).post('/api/auth/reset-password').send({ token: rawToken, password: 'new-password' });
  assert.strictEqual(reset.status, 200);

  const loginOld = await request(app).post('/api/auth/login').send({ email, password: 'old-password' });
  assert.strictEqual(loginOld.status, 401);

  const loginNew = await request(app).post('/api/auth/login').send({ email, password: 'new-password' });
  assert.strictEqual(loginNew.status, 200);
});

test('GET /api/auth/unsubscribe-digest redirects and flips digest_subscribed off for a valid one-click token', async () => {
  const jwt = require('jsonwebtoken');
  const email = `unsub-${unique()}@example.com`;
  const signup = await request(app).post('/api/auth/signup').send({ email, name: 'Unsub Test', password: 'password123' });
  const userId = signup.body.user.id;

  const unsubToken = jwt.sign({ sub: userId, purpose: 'digest-unsubscribe' }, process.env.JWT_SECRET, { expiresIn: '30d' });
  const res = await request(app).get(`/api/auth/unsubscribe-digest?token=${unsubToken}`);
  assert.strictEqual(res.status, 302);
  assert.match(res.headers.location, /\/predictor/);

  const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${signup.body.token}`);
  assert.strictEqual(me.body.user.digestSubscribed, false);
});

test('GET /api/auth/unsubscribe-digest fails open (redirects, does not error) for a garbage token', async () => {
  const res = await request(app).get('/api/auth/unsubscribe-digest?token=not-a-real-jwt');
  assert.strictEqual(res.status, 302);
});
