// Mirrors backend/utils/hIndex.js + prediction.js so the demo mode
// (no backend calls) can compute a live projection client-side.

export function calculateHIndex(citations) {
  if (!Array.isArray(citations) || citations.length === 0) return 0;
  const sorted = [...citations].sort((a, b) => b - a);
  let h = 0;
  for (let i = 0; i < sorted.length; i += 1) {
    if (sorted[i] >= i + 1) h = i + 1;
    else break;
  }
  return h;
}

// Simplified real-world citation-lifecycle curve — see the matching
// backend/utils/prediction.js comment for the full rationale (slow start,
// peak around year 2-4, long tail). Kept in sync with that file by hand
// since this app has no shared package between frontend/backend.
export function ageGrowthMultiplier(ageYears) {
  if (ageYears < 0) return 0.35;
  if (ageYears < 1) return 0.45;
  if (ageYears < 2) return 0.85;
  if (ageYears < 4) return 1.2;
  if (ageYears < 7) return 0.9;
  if (ageYears < 12) return 0.55;
  return 0.3;
}

/**
 * Two modes, same as the backend version: pass `currentPaperYears`
 * (parallel to `currentCitations`, publish year or null per paper) to get
 * the age-aware "real" projection; omit it for the old flat-rate model.
 */
export function projectHIndex({
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
  const useRealCurve = Array.isArray(currentPaperYears) && currentPaperYears.length === currentCitations.length;
  const birthYear = useRealCurve ? [...currentPaperYears] : citations.map(() => null);

  const path = [];
  let h = calculateHIndex(citations);
  const total = () => citations.reduce((a, b) => a + b, 0);
  path.push({ month: 0, hIndex: h, totalCitations: total() });

  if (h >= targetH) return { estimatedMonths: 0, reached: true, path };

  function ageMultiplierFor(i, simYear) {
    if (!useRealCurve || birthYear[i] == null) return 1;
    return ageGrowthMultiplier(simYear - birthYear[i]);
  }

  let acc = 0;
  let month = 0;
  let reached = false;

  while (month < maxMonths) {
    month += 1;
    const simYear = currentYear + month / 12;
    for (let i = 0; i < citations.length; i += 1) {
      const baseRate = isNewPaper[i] ? monthlyCitationRate * newPaperCitationMultiplier : monthlyCitationRate;
      const rate = baseRate * ageMultiplierFor(i, simYear);
      citations[i] += Math.max(rate, 0);
    }
    acc += papersPerYear / 12;
    while (acc >= 1) {
      citations.push(0);
      isNewPaper.push(true);
      birthYear.push(simYear);
      acc -= 1;
    }
    h = calculateHIndex(citations);
    path.push({ month, hIndex: h, totalCitations: total() });
    if (h >= targetH) {
      reached = true;
      break;
    }
  }

  return { estimatedMonths: reached ? month : null, reached, path };
}
