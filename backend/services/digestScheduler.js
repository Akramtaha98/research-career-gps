const cron = require('node-cron');
const jwt = require('jsonwebtoken');
const store = require('./store');
const { projectHIndex } = require('../utils/prediction');
const { sendProgressDigestEmail } = require('./email');

// Small pause between sends so a burst of subscribers doesn't hammer the
// Resend API all at once — same spirit as snapshotScheduler.js's
// DELAY_BETWEEN_MS, just shorter since this is a lighter call.
const DELAY_BETWEEN_MS = 500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Finds the h_index_history row closest to (but not after) `daysAgo` days
 * back, so "gained since last week" is measured against a real recorded
 * snapshot rather than assuming one exists exactly 7 days back. Falls back
 * to the oldest snapshot on record if the researcher hasn't been tracked a
 * full week yet — first digest still shows *something* instead of all zeros.
 * `history` must already be sorted ascending by recorded_at (both stores'
 * getHistory does this).
 */
function findBaselineSnapshot(history, daysAgo) {
  if (history.length === 0) return null;
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - daysAgo);
  const before = history.filter((h) => new Date(h.snapshot_date || h.recorded_at) <= cutoff);
  return before.length > 0 ? before[before.length - 1] : history[0];
}

/**
 * Builds the email payload for one subscriber, or null if there's nothing
 * worth sending them this week — no tracked researcher yet, no saved goal
 * (Predictor page), or literally zero movement and the goal isn't freshly
 * reached. Keeping this a pure "return null to skip" function (rather than
 * throwing) keeps runDigestSweep's per-user try/catch reserved for actual
 * failures, not expected no-op cases.
 */
async function buildDigestForUser(user) {
  const researcher = await store.findLatestResearcherByUser(user.id);
  if (!researcher) return null;

  const prediction = await store.getLatestPrediction(researcher.id);
  if (!prediction) return null;

  const history = await store.getHistory(researcher.id);
  const baseline = findBaselineSnapshot(history, 7);

  const hGained = baseline ? researcher.h_index - baseline.h_index : 0;
  const citationsGained = baseline ? Math.max(researcher.total_citations - baseline.total_citations, 0) : 0;
  const papersGained =
    baseline && baseline.paper_count != null ? Math.max(researcher.paper_count - baseline.paper_count, 0) : 0;

  const reached = researcher.h_index >= prediction.target_h;
  if (!reached && hGained === 0 && citationsGained === 0 && papersGained === 0) {
    return null; // nothing moved this week and the goal isn't freshly hit — skip the noise
  }

  // Fresh "months remaining from today", not the stale estimate saved when
  // the goal was first created — reuses the exact same projection model the
  // Predictor page itself uses. venueTier isn't persisted on the prediction
  // row, so this uses the default (1x) multiplier, same as a re-save with
  // no venue selected would.
  let estimatedMonthsRemaining = null;
  if (!reached) {
    const papers = await store.listPapers(researcher.id);
    const projection = projectHIndex({
      currentCitations: papers.map((p) => p.citations || 0),
      currentPaperYears: papers.map((p) => p.year || null),
      targetH: prediction.target_h,
      monthlyCitationRate: Number(prediction.monthly_citations),
      papersPerYear: Number(prediction.papers_per_year),
    });
    estimatedMonthsRemaining = projection.estimatedMonths;
  }

  return {
    to: user.email,
    name: user.name,
    researcherName: researcher.name || 'your tracked researcher',
    currentH: researcher.h_index,
    targetH: prediction.target_h,
    hGained,
    citationsGained,
    papersGained,
    estimatedMonthsRemaining,
  };
}

/** Runs one full sweep — exported directly so it can be triggered manually / from a test, not just from the cron schedule. */
async function runDigestSweep() {
  const users = await store.getDigestSubscribers();
  if (users.length === 0) return { checked: 0, sent: 0 };

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  let sent = 0;

  for (const user of users) {
    try {
      const digest = await buildDigestForUser(user);
      if (!digest) continue;

      // Short-lived one-click unsubscribe token — see authController.js#unsubscribeDigest.
      const unsubToken = jwt.sign({ sub: user.id, purpose: 'digest-unsubscribe' }, process.env.JWT_SECRET, {
        expiresIn: '30d',
      });
      const apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:4000/api';

      await sendProgressDigestEmail({
        ...digest,
        dashboardUrl: `${frontendUrl}/dashboard`,
        unsubscribeUrl: `${apiBaseUrl}/auth/unsubscribe-digest?token=${unsubToken}`,
      });
      sent += 1;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`Weekly digest failed for user ${user.id}:`, err.message);
    }
    await sleep(DELAY_BETWEEN_MS);
  }

  return { checked: users.length, sent };
}

/**
 * Starts the weekly cron that emails subscribed users their goal-progress
 * update. Runs Monday 13:00 UTC — after the nightly snapshot sweep
 * (services/snapshotScheduler.js, 03:00 UTC daily) has had all week to keep
 * h_index_history fresh, so the numbers this reports on are current.
 *
 * Set ENABLE_DIGEST_CRON=false to disable — same reasoning as
 * ENABLE_SNAPSHOT_CRON (local dev, or running multiple server instances
 * where only one should schedule this).
 */
function startDigestScheduler() {
  if (process.env.ENABLE_DIGEST_CRON === 'false') {
    // eslint-disable-next-line no-console
    console.log('Digest cron disabled (ENABLE_DIGEST_CRON=false).');
    return;
  }
  cron.schedule('0 13 * * 1', () => {
    runDigestSweep().catch((err) => {
      // eslint-disable-next-line no-console
      console.error('Weekly digest sweep failed:', err.message);
    });
  });
  // eslint-disable-next-line no-console
  console.log('Digest cron scheduled: weekly on Monday at 13:00 UTC, emailing goal-progress updates to subscribed users.');
}

module.exports = { startDigestScheduler, runDigestSweep };
