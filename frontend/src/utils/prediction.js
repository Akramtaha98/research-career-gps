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

export function projectHIndex({ currentCitations, targetH, monthlyCitationRate, papersPerYear, maxMonths = 240 }) {
  const citations = [...currentCitations];
  const path = [];
  let h = calculateHIndex(citations);
  const total = () => citations.reduce((a, b) => a + b, 0);
  path.push({ month: 0, hIndex: h, totalCitations: total() });

  if (h >= targetH) return { estimatedMonths: 0, reached: true, path };

  let acc = 0;
  let month = 0;
  let reached = false;

  while (month < maxMonths) {
    month += 1;
    for (let i = 0; i < citations.length; i += 1) {
      citations[i] += Math.max(monthlyCitationRate, 0);
    }
    acc += papersPerYear / 12;
    while (acc >= 1) {
      citations.push(0);
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
