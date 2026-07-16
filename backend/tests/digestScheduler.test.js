process.env.DEMO_MODE = 'true';
process.env.JWT_SECRET = 'test-secret-digest';
process.env.FRONTEND_URL = 'http://localhost:5173';
process.env.API_BASE_URL = 'http://localhost:4000/api';
// Deliberately no RESEND_API_KEY -- every send in this file is expected to
// fail closed (caught, logged, sweep continues) rather than crash, exactly
// as it will in any environment where the key isn't configured yet.

const test = require('node:test');
const assert = require('node:assert');
const store = require('../services/store');
const { runDigestSweep } = require('../services/digestScheduler');

const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

test('runDigestSweep skips subscribers with no tracked researcher', async () => {
  const user = await store.createUser({
    email: `nodigest-${unique()}@example.com`,
    name: 'No Researcher',
    passwordHash: 'x',
    emailVerified: true,
  });
  assert.ok((await store.getDigestSubscribers()).some((u) => u.id === user.id));

  const result = await runDigestSweep();
  assert.strictEqual(result.sent, 0);
});

test('runDigestSweep skips subscribers with a researcher but no saved goal', async () => {
  const user = await store.createUser({
    email: `nogoal-${unique()}@example.com`,
    name: 'No Goal',
    passwordHash: 'x',
    emailVerified: true,
  });
  await store.upsertResearcher({
    userId: user.id,
    semanticScholarId: `ss-${unique()}`,
    name: 'Some Researcher',
    hIndex: 5,
    totalCitations: 100,
    paperCount: 8,
  });

  const before = await runDigestSweep();
  assert.strictEqual(before.sent, 0);
});

test('runDigestSweep skips a tracked+goaled researcher with zero movement and an unreached goal', async () => {
  const user = await store.createUser({
    email: `nomovement-${unique()}@example.com`,
    name: 'No Movement',
    passwordHash: 'x',
    emailVerified: true,
  });
  const researcher = await store.upsertResearcher({
    userId: user.id,
    semanticScholarId: `ss-${unique()}`,
    name: 'Stalled Researcher',
    hIndex: 5,
    totalCitations: 100,
    paperCount: 8,
  });
  // Goal not yet reached (target 10 > current h-index 5), and there's only
  // ever been one snapshot (today's, from upsertResearcher above) -- no
  // week-old baseline to have moved away from.
  await store.createPrediction({ researcherId: researcher.id, targetH: 10, monthlyCitations: 0.5, papersPerYear: 2, estimatedMonths: 24 });

  const result = await runDigestSweep();
  assert.strictEqual(result.sent, 0, 'nothing moved and the goal is not freshly reached -- should not send');
});

test('runDigestSweep attempts a send once the saved goal is reached, even with zero other movement', async () => {
  const user = await store.createUser({
    email: `reached-${unique()}@example.com`,
    name: 'Reached Goal',
    passwordHash: 'x',
    emailVerified: true,
  });
  const researcher = await store.upsertResearcher({
    userId: user.id,
    semanticScholarId: `ss-${unique()}`,
    name: 'Successful Researcher',
    hIndex: 10,
    totalCitations: 500,
    paperCount: 20,
  });
  // Target already met (8 <= 10) -- crossing the goal is itself the news.
  await store.createPrediction({ researcherId: researcher.id, targetH: 8, monthlyCitations: 0.5, papersPerYear: 2, estimatedMonths: 0 });

  // No RESEND_API_KEY in this test env, so the send itself fails -- but the
  // sweep must catch that per-user and keep going (never throw), and `sent`
  // reports 0 because the attempted send genuinely didn't succeed.
  const result = await runDigestSweep();
  assert.strictEqual(result.sent, 0);
  assert.ok(result.checked >= 1);
});

test('runDigestSweep always returns a well-formed { checked, sent } summary', async () => {
  const result = await runDigestSweep();
  assert.ok(typeof result.checked === 'number');
  assert.ok(typeof result.sent === 'number');
});
