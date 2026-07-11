/**
 * Pure computation over already-fetched snapshot rows for the Timeline
 * feature — no DB/network calls here, so this is easy to unit-test and
 * reuse (see researcherController.js's getTimeline for how it's wired to
 * the store). Deliberately only derives events from snapshots Research GPS
 * has actually recorded ("Recorded by Research GPS") — it never fabricates
 * history from before the researcher was first tracked. The separate,
 * reconstructed-from-citation-data history (services/historicalHIndex.js)
 * covers that earlier period and is labeled differently on the frontend.
 */

const CITATION_MILESTONE_THRESHOLDS = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000];

/**
 * Compares the two most recent researcher-level snapshots and, when
 * possible, the paper-level snapshots on those same two dates. Returns null
 * if there's only one snapshot ever recorded (nothing to compare against
 * yet — the researcher was tracked but this is the first time back).
 */
function computeSinceLastVisit(snapshots, paperSnapshots) {
  const sorted = [...snapshots].sort((a, b) => (a.snapshot_date < b.snapshot_date ? -1 : 1));
  if (sorted.length < 2) return null;

  const previous = sorted[sorted.length - 2];
  const latest = sorted[sorted.length - 1];

  const result = {
    fromDate: previous.snapshot_date,
    toDate: latest.snapshot_date,
    citationsDelta: (latest.total_citations || 0) - (previous.total_citations || 0),
    hIndexDelta: (latest.h_index || 0) - (previous.h_index || 0),
    paperCountDelta:
      latest.paper_count != null && previous.paper_count != null ? latest.paper_count - previous.paper_count : null,
    // Best-effort: only computable if paper-level snapshots exist on BOTH
    // exact dates being compared. paper_snapshots started later than
    // h_index_history, so early adopters' oldest researcher-level snapshots
    // may predate any paper-level data — null (not 0) signals "unknown",
    // not "no papers changed".
    papersWithIncreasedCitations: null,
  };

  const prevPaperMap = new Map(
    paperSnapshots
      .filter((p) => p.snapshot_date === previous.snapshot_date)
      .map((p) => [p.external_id, p.citation_count])
  );
  const latestPaperRows = paperSnapshots.filter((p) => p.snapshot_date === latest.snapshot_date);
  if (prevPaperMap.size > 0 && latestPaperRows.length > 0) {
    let increased = 0;
    for (const row of latestPaperRows) {
      const before = prevPaperMap.get(row.external_id);
      if (before != null && row.citation_count > before) increased += 1;
    }
    result.papersWithIncreasedCitations = increased;
  }

  return result;
}

/**
 * Derives a chronological milestone list purely from recorded snapshots:
 * the first-ever snapshot, every H-index increase, and every round-number
 * total-citations threshold crossed. Sorted oldest first.
 */
function computeMilestones(snapshots) {
  const sorted = [...snapshots].sort((a, b) => (a.snapshot_date < b.snapshot_date ? -1 : 1));
  if (sorted.length === 0) return [];

  const milestones = [];
  const first = sorted[0];
  milestones.push({
    date: first.snapshot_date,
    type: 'first_snapshot',
    hIndex: first.h_index,
    totalCitations: first.total_citations,
  });

  let lastH = first.h_index;
  const crossedThresholds = new Set(CITATION_MILESTONE_THRESHOLDS.filter((t) => (first.total_citations || 0) >= t));

  for (let i = 1; i < sorted.length; i += 1) {
    const snap = sorted[i];
    if (snap.h_index > lastH) {
      milestones.push({ date: snap.snapshot_date, type: 'h_index_increase', hIndex: snap.h_index, previousHIndex: lastH });
      lastH = snap.h_index;
    }
    for (const threshold of CITATION_MILESTONE_THRESHOLDS) {
      if (!crossedThresholds.has(threshold) && (snap.total_citations || 0) >= threshold) {
        milestones.push({ date: snap.snapshot_date, type: 'citation_milestone', threshold });
        crossedThresholds.add(threshold);
      }
    }
  }

  return milestones;
}

module.exports = { computeSinceLastVisit, computeMilestones, CITATION_MILESTONE_THRESHOLDS };
