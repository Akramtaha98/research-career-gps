const { calculateHIndex } = require('./hIndex');

/**
 * Simplified real-world citation-lifecycle curve: citations to a paper don't
 * accrue at a constant rate over its lifetime. In practice they're slow
 * right after publication (indexing lag, the field hasn't found it yet),
 * ramp up over the following 1-3 years, peak somewhere around year 2-4, then
 * gradually taper into a long tail as the paper ages. This is a
 * deliberately simplified stand-in for the log-normal-shaped citation
 * curves documented in bibliometrics research (e.g. Wang, Song & Barabási,
 * "Quantifying Long-Term Scientific Impact", 2013) — not a fitted or
 * peer-reviewed model, just enough shape so a projection that knows each
 * paper's actual publish year tracks reality better than applying one flat
 * monthly rate to every paper regardless of age.
 *
 * @param {number} ageYears - paper age in (fractional) years at the point being simulated
 * @returns {number} multiplier applied to the base monthly citation rate for a paper of this age
 */
function ageGrowthMultiplier(ageYears) {
  if (ageYears < 0) return 0.35; // not "out" yet in the simulation, but simulated as trickling in
  if (ageYears < 1) return 0.45; // just published — barely indexed/discovered
  if (ageYears < 2) return 0.85;
  if (ageYears < 4) return 1.2; // peak citation window
  if (ageYears < 7) return 0.9;
  if (ageYears < 12) return 0.55;
  return 0.3; // long tail
}

/**
 * Citation-growth + new-paper projection model.
 *
 * Two modes, chosen automatically based on what's passed in:
 *
 * 1. "Real" (age-aware) mode — when `currentPaperYears` is supplied
 *    (same length as `currentCitations`, each entry the paper's publish
 *    year or null if unknown), every paper's monthly citation gain is
 *    `monthlyCitationRate` scaled by ageGrowthMultiplier() for its age at
 *    that point in the simulation — see above. This is what
 *    predictionController.js and digestScheduler.js use, since they always
 *    have each tracked paper's actual `year`.
 * 2. Flat-rate mode — when `currentPaperYears` is omitted (or a paper's
 *    year is null), every existing paper gains a constant
 *    `monthlyCitationRate` every month regardless of age. Kept as the
 *    default/fallback so callers that don't have publish years (or a
 *    per-paper null) still get a sane, simple projection instead of a
 *    crash or a silently wrong one.
 *
 * New papers are added at a rate of `papersPerYear`, entering with 0
 * citations, and (in real mode) age forward through the same curve from the
 * month they're "published" in the simulation. `newPaperCitationMultiplier`
 * layers on top of that — modeling publishing in a higher-impact venue
 * going forward — without retroactively changing the trajectory of papers
 * already published (see utils/venueTiers.js).
 *
 * @param {object} params
 * @param {number[]} params.currentCitations - citation counts of existing papers
 * @param {(number|null)[]} [params.currentPaperYears] - parallel array to currentCitations; each paper's publish year, or null if unknown. Supplying this switches on the age-aware "real" model.
 * @param {number} params.targetH - desired H-index
 * @param {number} params.monthlyCitationRate - base avg citations gained per existing paper per month (scaled by age in real mode)
 * @param {number} params.papersPerYear - rate of new papers published
 * @param {number} [params.newPaperCitationMultiplier=1] - multiplier applied to new papers' growth rate (venue-tier boost)
 * @param {number} [params.maxMonths=240] - safety cap (20 years)
 * @param {number} [params.currentYear] - simulation's "now", for age math in real mode; defaults to the current calendar year
 * @returns {{ estimatedMonths: number|null, reached: boolean, path: Array }}
 */
function projectHIndex({
  currentCitations,
  currentPaperYears,
  targetH,
  monthlyCitationRate,
  papersPerYear,
  newPaperCitationMultiplier = 1,
  maxMonths = 240,
  currentYear = new Date().getFullYear(),
}) {
  const citations = [...currentCitations];
  const isNewPaper = citations.map(() => false);

  // Only meaningful in real mode — parallel to citations/isNewPaper.
  // birthYear is fractional (currentYear + monthsIntoSim / 12) so a paper's
  // age-in-years advances smoothly month to month instead of jumping every
  // January.
  const useRealCurve = Array.isArray(currentPaperYears) && currentPaperYears.length === currentCitations.length;
  const birthYear = useRealCurve ? [...currentPaperYears] : citations.map(() => null);

  const path = [];

  let h = calculateHIndex(citations);
  const totalCitations = () => citations.reduce((a, b) => a + b, 0);
  path.push({ month: 0, hIndex: h, totalCitations: totalCitations(), paperCount: citations.length });

  if (h >= targetH) {
    return { estimatedMonths: 0, reached: true, path };
  }

  // Per-paper age multiplier for the current simulated month — falls back
  // to a neutral 1x when real mode is off, or when this specific paper's
  // publish year is unknown, rather than guessing.
  function ageMultiplierFor(i, simYear) {
    if (!useRealCurve || birthYear[i] == null) return 1;
    return ageGrowthMultiplier(simYear - birthYear[i]);
  }

  let newPaperAccumulator = 0;
  let month = 0;
  let reached = false;

  while (month < maxMonths) {
    month += 1;
    const simYear = currentYear + month / 12;

    // existing papers grow at the base rate (scaled by age in real mode);
    // papers added during the simulation grow at the base rate scaled by
    // both the venue multiplier and their own age.
    for (let i = 0; i < citations.length; i += 1) {
      const baseRate = isNewPaper[i] ? monthlyCitationRate * newPaperCitationMultiplier : monthlyCitationRate;
      const rate = baseRate * ageMultiplierFor(i, simYear);
      citations[i] += Math.max(rate, 0);
    }

    // add new papers at the configured rate
    newPaperAccumulator += papersPerYear / 12;
    while (newPaperAccumulator >= 1) {
      citations.push(0);
      isNewPaper.push(true);
      birthYear.push(simYear);
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

module.exports = { projectHIndex, ageGrowthMultiplier };
