const { calculateHIndex } = require('./hIndex');

/**
 * Simple linear projection model.
 *
 * Each month every existing paper gains `monthlyCitationRate` citations
 * (average per paper). New papers are added at a rate of `papersPerYear`,
 * entering with 0 citations. `newPaperCitationMultiplier` lets new papers
 * grow faster (or slower) than existing ones — used to model publishing in
 * a higher-impact venue going forward, without retroactively changing the
 * citation trajectory of papers already published (see utils/venueTiers.js).
 *
 * @param {object} params
 * @param {number[]} params.currentCitations - citation counts of existing papers
 * @param {number} params.targetH - desired H-index
 * @param {number} params.monthlyCitationRate - avg citations gained per existing paper per month
 * @param {number} params.papersPerYear - rate of new papers published
 * @param {number} [params.newPaperCitationMultiplier=1] - multiplier applied to new papers' growth rate
 * @param {number} [params.maxMonths=240] - safety cap (20 years)
 * @returns {{ estimatedMonths: number|null, reached: boolean, path: Array }}
 */
function projectHIndex({
  currentCitations,
  targetH,
  monthlyCitationRate,
  papersPerYear,
  newPaperCitationMultiplier = 1,
  maxMonths = 240,
}) {
  const citations = [...currentCitations];
  const isNewPaper = citations.map(() => false);
  const path = [];

  let h = calculateHIndex(citations);
  const totalCitations = () => citations.reduce((a, b) => a + b, 0);
  path.push({ month: 0, hIndex: h, totalCitations: totalCitations(), paperCount: citations.length });

  if (h >= targetH) {
    return { estimatedMonths: 0, reached: true, path };
  }

  let newPaperAccumulator = 0;
  let month = 0;
  let reached = false;

  while (month < maxMonths) {
    month += 1;

    // existing papers grow at the base rate; papers added during the
    // simulation grow at the base rate scaled by the venue multiplier.
    for (let i = 0; i < citations.length; i += 1) {
      const rate = isNewPaper[i] ? monthlyCitationRate * newPaperCitationMultiplier : monthlyCitationRate;
      citations[i] += Math.max(rate, 0);
    }

    // add new papers at the configured rate
    newPaperAccumulator += papersPerYear / 12;
    while (newPaperAccumulator >= 1) {
      citations.push(0);
      isNewPaper.push(true);
      newPaperAccumulator -= 1;
    }

    h = calculateHIndex(citations);
    path.push({ month, hIndex: h, totalCitations: totalCitations(), paperCount: citations.length });

    if (h >= targetH) {
      reached = true;
      break;
    }
  }

  return { estimatedMonths: reached ? month : null, reached, path };
}

module.exports = { projectHIndex };
