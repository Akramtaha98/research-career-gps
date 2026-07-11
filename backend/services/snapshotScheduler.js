const cron = require('node-cron');
const store = require('./store');
const researcherSource = require('./researcherSource');

// A researcher is "due" for a fresh snapshot once their last recorded one is
// this many days old. Checked daily (see startSnapshotScheduler below), but
// since each individual researcher only actually gets re-fetched once this
// threshold passes, the effective cadence per researcher is monthly.
const SNAPSHOT_INTERVAL_DAYS = 30;

// Space out external API calls when several researchers are due at once, so
// this sweep doesn't burst-hit Semantic Scholar/OpenAlex rate limits.
const DELAY_BETWEEN_MS = 2000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Re-fetches one researcher's profile and records a fresh snapshot — the
 * same sequence a manual "Refresh from Semantic Scholar" click runs in
 * researcherController.js's getResearcher, just triggered by the scheduler
 * instead of a user action. Best-effort: one researcher's fetch failing
 * (deleted upstream profile, rate limit, network blip) must not stop the
 * rest of the sweep.
 */
async function refreshAndSnapshot(researcher) {
  try {
    const profile = await researcherSource.fetchAuthorProfile(researcher.semantic_scholar_id, researcher.source);
    const updated = await store.upsertResearcher({
      userId: researcher.user_id,
      semanticScholarId: profile.semanticScholarId,
      name: profile.name,
      hIndex: profile.hIndex,
      totalCitations: profile.totalCitations,
      paperCount: profile.paperCount,
      source: profile.source,
      orcid: profile.orcid || null,
    });
    await store.replacePapers(updated.id, profile.papers);
    await store.snapshotPapers(updated.id, profile.papers);
    return true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`Monthly snapshot failed for researcher ${researcher.id}:`, err.message);
    return false;
  }
}

/** Runs one full sweep — exported directly so it can be triggered manually / from a test, not just from the cron schedule. */
async function runSnapshotSweep() {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - SNAPSHOT_INTERVAL_DAYS);
  const cutoffDate = cutoff.toISOString().slice(0, 10);

  const due = await store.getResearchersNeedingSnapshot(cutoffDate);
  if (due.length === 0) return { checked: 0, refreshed: 0 };

  // eslint-disable-next-line no-console
  console.log(`Monthly snapshot sweep: ${due.length} researcher(s) due for a refresh.`);
  let refreshed = 0;
  for (const researcher of due) {
    const ok = await refreshAndSnapshot(researcher);
    if (ok) refreshed += 1;
    await sleep(DELAY_BETWEEN_MS);
  }
  return { checked: due.length, refreshed };
}

/**
 * Starts the daily cron check that keeps Timeline history fresh for users
 * who never manually hit "Refresh" — without this, someone who tracks a
 * researcher once and never returns would be stuck with a single snapshot
 * forever, and the Timeline's "recorded by Research GPS" history would never
 * grow past that first day. Runs once a day at 03:00 UTC; see
 * SNAPSHOT_INTERVAL_DAYS above for why this is a monthly cadence per
 * researcher despite the daily check.
 *
 * Set ENABLE_SNAPSHOT_CRON=false to disable — e.g. for local development, or
 * if running multiple server instances where only one should schedule this
 * (this app has no distributed-lock mechanism; running it on more than one
 * instance would just mean redundant, harmless duplicate work, but you may
 * still want only one).
 */
function startSnapshotScheduler() {
  if (process.env.ENABLE_SNAPSHOT_CRON === 'false') {
    // eslint-disable-next-line no-console
    console.log('Snapshot cron disabled (ENABLE_SNAPSHOT_CRON=false).');
    return;
  }
  cron.schedule('0 3 * * *', () => {
    runSnapshotSweep().catch((err) => {
      // eslint-disable-next-line no-console
      console.error('Monthly snapshot sweep failed:', err.message);
    });
  });
  // eslint-disable-next-line no-console
  console.log('Snapshot cron scheduled: daily at 03:00 UTC, refreshing researchers whose last snapshot is 30+ days old.');
}

module.exports = { startSnapshotScheduler, runSnapshotSweep };
