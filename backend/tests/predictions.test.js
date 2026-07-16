process.env.DEMO_MODE = 'true';
process.env.JWT_SECRET = 'test-secret-predictions';
process.env.ENABLE_SNAPSHOT_CRON = 'false';
process.env.ENABLE_DIGEST_CRON = 'false';
// This file signs up several users via the rate-limited /auth/signup route.
process.env.DISABLE_RATE_LIMIT = 'true';

const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const app = require('../server');
const store = require('../services/store');

const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

async function signupAndTrackResearcher() {
  const email = `pred-${unique()}@example.com`;
  const signup = await request(app).post('/api/auth/signup').send({ email, name: 'Pred Test', password: 'password123' });
  const token = signup.body.token;
  const userId = signup.body.user.id;

  const researcher = await store.upsertResearcher({
    userId,
    semanticScholarId: `ss-${unique()}`,
    name: 'Test Researcher',
    hIndex: 3,
    totalCitations: 40,
    paperCount: 5,
  });
  await store.replacePapers(researcher.id, [
    { externalId: 'p1', title: 'Paper 1', year: new Date().getFullYear() - 3, citations: 10 },
    { externalId: 'p2', title: 'Paper 2', year: new Date().getFullYear() - 1, citations: 5 },
    { externalId: 'p3', title: 'Paper 3', year: new Date().getFullYear(), citations: 1 },
  ]);

  return { token, userId, researcher };
}

test('POST /api/predictions requires auth', async () => {
  const res = await request(app).post('/api/predictions').send({});
  assert.strictEqual(res.status, 401);
});

test('POST /api/predictions is gated behind a Pro subscription (402)', async () => {
  const { token, researcher } = await signupAndTrackResearcher();

  const res = await request(app)
    .post('/api/predictions')
    .set('Authorization', `Bearer ${token}`)
    .send({ researcherId: researcher.id, targetH: 10, monthlyCitationRate: 1, papersPerYear: 2 });

  assert.strictEqual(res.status, 402);
  assert.strictEqual(res.body.upgradeRequired, true);
});

test('POST /api/predictions rejects a researcher that belongs to someone else', async () => {
  const owner = await signupAndTrackResearcher();
  await store.updateUserBilling(owner.userId, { plan: 'pro', subscriptionStatus: 'active' });

  const intruderEmail = `intruder-${unique()}@example.com`;
  const intruder = await request(app)
    .post('/api/auth/signup')
    .send({ email: intruderEmail, name: 'Intruder', password: 'password123' });
  await store.updateUserBilling(intruder.body.user.id, { plan: 'pro', subscriptionStatus: 'active' });

  const res = await request(app)
    .post('/api/predictions')
    .set('Authorization', `Bearer ${intruder.body.token}`)
    .send({ researcherId: owner.researcher.id, targetH: 10, monthlyCitationRate: 1, papersPerYear: 2 });

  assert.strictEqual(res.status, 403);
});

test('POST /api/predictions creates a goal and returns a real (age-aware) projection for a Pro user', async () => {
  const { token, userId, researcher } = await signupAndTrackResearcher();
  await store.updateUserBilling(userId, { plan: 'pro', subscriptionStatus: 'active' });

  const res = await request(app)
    .post('/api/predictions')
    .set('Authorization', `Bearer ${token}`)
    .send({ researcherId: researcher.id, targetH: 4, monthlyCitationRate: 1, papersPerYear: 2, venueTier: 'top' });

  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.prediction.target_h, 4);
  assert.ok(res.body.projection);
  assert.ok(Array.isArray(res.body.projection.path));
  // With 3 tracked papers and a moderate growth rate this should be
  // reachable well within the model's safety cap.
  assert.strictEqual(res.body.projection.reached, true);
  assert.ok(typeof res.body.projection.estimatedMonths === 'number');
});

test('POST /api/predictions validates required fields', async () => {
  const { token, userId, researcher } = await signupAndTrackResearcher();
  await store.updateUserBilling(userId, { plan: 'pro', subscriptionStatus: 'active' });

  const res = await request(app)
    .post('/api/predictions')
    .set('Authorization', `Bearer ${token}`)
    .send({ researcherId: researcher.id });

  assert.strictEqual(res.status, 400);
});
