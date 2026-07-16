const { calculateHIndex } = require('../utils/hIndex');
const { fetchBatchPaperCitationYears, fetchPaperCitationYears } = require('./semanticScholar');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Semantic Scholar's public rate limit is ~100 requests / 5 minutes without
// an API key. This used to make one request PER PAPER (with a 1.1s delay
// between each) to stay under that -- correct, but slow: 60+ seconds for a
// prolific researcher. Now it fetches all papers' citation-years via a
// single batched /paper/batch call (see fetchBatchPaperCitationYears in
// semanticScholar.js) and only falls back to the slower per-paper endpoint
// for papers whose batched result looks truncated (see BATCH_CAP below) --
// typically 0-2 requests total instead of up to MAX_PAPERS.
const MAX_PAPERS = 60;

// The nested `citations.year` field on /paper/batch is capped per paper --
// confirmed live against the API (a paper with 117k+ real citations, e.g.
// the BERT paper, comes back with exactly 9999 entries, not the full
// count). Undocumented exact behavior, so this stays a little conservative
// (9990, not 9999) -- if a paper's batched result meets or exceeds this,
// treat it as "possibly truncated" and re-fetch that one paper via the
// paginated fetchPaperCitationYears instead of silently under-counting it.
// In practice this only ever fires for a handful of extremely highly-cited
// papers; everything else gets its full, exact citation history from the
// single batched call.
const BATCH_CAP = 9990;

/**
 * Reconstructs a researcher's REAL H-index for each year from firstYear to
 * lastYear (inclusive), using actual citation data from Semantic Scholar —
 * not an estimate. For each paper, we know exactly which years its citing
 * papers were published in, so "citations paper P had by year Y" is just a
 * count, and a paper only counts at all once it has actually been published
 * (year <= Y).
 *
 * Only the top MAX_PAPERS papers by current citation count are considered,
 * to bound the number of Semantic Scholar requests — papers with very few
 * citations essentially never move the H-index, so this doesn't meaningfully
 * change the result for the vast majority of researchers.
 *
 * @param {{externalId: string|null, year: number|null, citations: number}[]} papers
 * @returns {Promise<{ history: {year:number, hIndex:number}[], papersConsidered: number, papersSkipped: number }>}
 */
async function computeHistoricalHIndex(papers) {
  const eligible = papers.filter((p) => p.externalId && p.year);
  const skippedNoId = papers.length - eligible.length;

  const topPapers = [...eligible]
    .sort((a, b) => (b.citations || 0) - (a.citations || 0))
    .slice(0, MAX_PAPERS);

  const earliestYear = topPapers.reduce(
    (min, p) => Math.min(min, p.year),
    new Date().getFullYear()
  );
  const currentYear = new Date().getFullYear();

  if (topPapers.length === 0) {
    return { history: [], papersConsidered: 0, papersSkipped: papers.length };
  }

  // One batched request for every paper's citation-years (instead of the
  // old one-request-per-paper-with-a-sleep loop) — see BATCH_CAP above for
  // why a handful of outlier papers might still need a second, slower
  // request each.
  const batchResults = await fetchBatchPaperCitationYears(topPapers.map((p) => p.externalId));

  const possiblyTruncated = topPapers.filter(
    (p) => (batchResults.get(p.externalId) || []).length >= BATCH_CAP
  );
  if (possiblyTruncated.length > 0) {
    // eslint-disable-next-line no-console
    console.log(
      `Historical H-index: ${possiblyTruncated.length} paper(s) hit the batch citation cap, re-fetching exactly via pagination.`
    );
  }
  for (const paper of possiblyTruncated) {
    // eslint-disable-next-line no-await-in-loop
    const exact = await fetchPaperCitationYears(paper.externalId);
    batchResults.set(paper.externalId, exact);
    // Small courtesy delay only for this rare fallback path, not the common
    // case — these are individual, potentially paginated requests.
    // eslint-disable-next-line no-await-in-loop
    await sleep(500);
  }

  const perPaperYears = topPapers.map((paper) => ({
    paperYear: paper.year,
    citingYears: batchResults.get(paper.externalId) || [],
    currentCitations: paper.citations || 0,
  }));

  const history = [];
  for (let year = earliestYear; year <= currentYear; year += 1) {
    const citationCountsByYear = perPaperYears
      .filter((p) => p.paperYear <= year)
      .map((p) => {
        // For the current year, use Semantic Scholar's own authoritative
        // citation total instead of counting dated citing papers — some
        // citing papers have no publication year on file, so counting only
        // dated ones systematically UNDER-counts "now" and disagrees with
        // the official H-index shown elsewhere in the app. Past years have
        // no better source, so they still rely on dated citations only
        // (meaning they're a reconstructed lower bound, most accurate for
        // well-indexed recent papers).
        if (year === currentYear) return p.currentCitations;
        return p.citingYears.filter((y) => y <= year).length;
      });

    if (citationCountsByYear.length === 0) continue;
    history.push({ year, hIndex: calculateHIndex(citationCountsByYear) });
  }

  return {
    history,
    papersConsidered: topPapers.length,
    papersSkipped: skippedNoId + (eligible.length - topPapers.length),
  };
}

module.exports = { computeHistoricalHIndex };
