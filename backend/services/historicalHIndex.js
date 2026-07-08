const { calculateHIndex } = require('../utils/hIndex');
const { fetchPaperCitationYears } = require('./semanticScholar');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Semantic Scholar's public rate limit is ~100 requests / 5 minutes without
// an API key. This computation makes one extra request per paper, so we
// space them out and cap how many papers we look at to stay well under that
// limit and keep the wait bounded for prolific researchers.
const REQUEST_DELAY_MS = 1100;
const MAX_PAPERS = 60;

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

  // Fetch sequentially (not in parallel) with a delay between calls — this
  // is intentionally slower than it could be, in exchange for not tripping
  // Semantic Scholar's rate limit on researchers with many papers.
  const perPaperYears = [];
  for (const paper of topPapers) {
    const citingYears = await fetchPaperCitationYears(paper.externalId);
    perPaperYears.push({ paperYear: paper.year, citingYears });
    await sleep(REQUEST_DELAY_MS);
  }

  const history = [];
  for (let year = earliestYear; year <= currentYear; year += 1) {
    const citationCountsByYear = perPaperYears
      .filter((p) => p.paperYear <= year)
      .map((p) => p.citingYears.filter((y) => y <= year).length);

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
