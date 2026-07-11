import { calculateHIndex } from './prediction';

/**
 * The "h-index frontier": which papers currently make up the h-index, and
 * exactly what it would take to push it to the next value. Pure client-side
 * computation over the already-loaded papers list (works identically for
 * demo and live data, no backend call needed — same pattern as
 * utils/prediction.js and utils/actionItems.js).
 *
 * Correctly handles the general case where MORE THAN ONE paper needs to
 * cross the next citation threshold at once, not just the single
 * closest-ranked paper. For example, with citations [12,10,8,8,7,6,5,4]:
 * h = 6 (the rank-7 paper only has 5 citations, below the 7 the 7th-ranked
 * slot requires). To reach h = 7, seven papers need >= 7 citations;
 * currently five do (12, 10, 8, 8, 7), so two more papers must cross that
 * line -- the ones with 6 and 5 citations, needing 1 and 2 more
 * respectively. A naive "just check the single next-ranked paper" approach
 * (as an earlier helper in backend/utils/hIndex.js does) would only look at
 * the 6-citation paper and miss that the 5-citation paper needs to cross
 * too.
 *
 * @param {{id, title, citations: number}[]} papers
 * @returns {{
 *   currentHIndex: number,
 *   nextThreshold: number,
 *   papersNeeded: number,
 *   papersNeededFromNewWork: number,
 *   corePapers: {id, title, citations}[],
 *   candidates: {id, title, citations, citationsNeeded}[],
 * }}
 */
export function computeHIndexFrontier(papers) {
  const withCitations = (papers || []).map((p) => ({ ...p, citations: p.citations || 0 }));
  const sorted = [...withCitations].sort((a, b) => b.citations - a.citations);
  const citations = sorted.map((p) => p.citations);

  const currentHIndex = calculateHIndex(citations);
  const nextThreshold = currentHIndex + 1;

  const corePapers = sorted.slice(0, currentHIndex);

  // How many papers already clear the NEXT threshold (by definition this is
  // always <= currentHIndex, since otherwise the h-index would already be
  // higher than currentHIndex).
  const atOrAboveNext = sorted.filter((p) => p.citations >= nextThreshold);
  const papersNeeded = Math.max(nextThreshold - atOrAboveNext.length, 0);

  // Candidates: papers not yet at the next threshold, closest first. Only
  // take as many as are actually needed to cross.
  const belowNext = sorted.filter((p) => p.citations < nextThreshold);
  const candidates = belowNext.slice(0, papersNeeded).map((p) => ({
    id: p.id,
    title: p.title,
    citations: p.citations,
    citationsNeeded: nextThreshold - p.citations,
  }));

  // If there aren't even enough EXISTING papers left to cover papersNeeded,
  // some of the gap can only be closed with new publications, not more
  // citations on what's already out there.
  const papersNeededFromNewWork = Math.max(papersNeeded - candidates.length, 0);

  return {
    currentHIndex,
    nextThreshold,
    papersNeeded,
    papersNeededFromNewWork,
    corePapers: corePapers.map((p) => ({ id: p.id, title: p.title, citations: p.citations })),
    candidates,
  };
}
