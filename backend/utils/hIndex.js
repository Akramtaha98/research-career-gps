/**
 * Standard H-index: the largest h such that the researcher has h papers
 * with at least h citations each.
 * @param {number[]} citations - citation counts, one per paper
 * @returns {number}
 */
function calculateHIndex(citations) {
  if (!Array.isArray(citations) || citations.length === 0) return 0;
  const sorted = [...citations].sort((a, b) => b - a);
  let h = 0;
  for (let i = 0; i < sorted.length; i += 1) {
    if (sorted[i] >= i + 1) {
      h = i + 1;
    } else {
      break;
    }
  }
  return h;
}

/**
 * Number of additional citations needed on the researcher's existing papers
 * to reach the next H-index value, ignoring future papers. Useful context
 * for the prediction engine and action-item generator.
 */
function citationsToNextHIndex(citations, currentH) {
  const sorted = [...citations].sort((a, b) => b - a);
  const nextRank = currentH; // 0-indexed position of the (h+1)-th paper
  if (nextRank >= sorted.length) return null; // need another paper, not just citations
  const paper = sorted[nextRank];
  const needed = currentH + 1 - paper;
  return Math.max(needed, 0);
}

module.exports = { calculateHIndex, citationsToNextHIndex };
