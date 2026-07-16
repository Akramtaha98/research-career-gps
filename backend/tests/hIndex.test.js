const test = require('node:test');
const assert = require('node:assert');
const { calculateHIndex } = require('../utils/hIndex');
const { projectHIndex, ageGrowthMultiplier } = require('../utils/prediction');
const { getMultiplier, getTierForVenue } = require('../utils/venueTiers');

test('calculateHIndex: standard example', () => {
  // 3 papers with >=3 citations, 4th has only 1 -> h=3
  assert.strictEqual(calculateHIndex([10, 8, 5, 1]), 3);
});

test('calculateHIndex: empty array', () => {
  assert.strictEqual(calculateHIndex([]), 0);
});

test('calculateHIndex: all zero citations', () => {
  assert.strictEqual(calculateHIndex([0, 0, 0]), 0);
});

test('calculateHIndex: classic h=5 example', () => {
  // citations: 25, 8, 5, 3, 3, 2, 0 -> sorted desc, rank5=3>=5? no wait check manually
  const citations = [25, 8, 5, 5, 3, 2, 0];
  // rank1=25>=1 ok, rank2=8>=2 ok, rank3=5>=3 ok, rank4=5>=4 ok, rank5=3>=5 fail -> h=4
  assert.strictEqual(calculateHIndex(citations), 4);
});

test('projectHIndex: already at target returns 0 months', () => {
  const result = projectHIndex({
    currentCitations: [10, 8, 5, 1],
    targetH: 3,
    monthlyCitationRate: 1,
    papersPerYear: 2,
  });
  assert.strictEqual(result.estimatedMonths, 0);
  assert.strictEqual(result.reached, true);
});

test('projectHIndex: reaches higher target eventually', () => {
  const result = projectHIndex({
    currentCitations: [3, 2, 1],
    targetH: 5,
    monthlyCitationRate: 2,
    papersPerYear: 4,
  });
  assert.strictEqual(result.reached, true);
  assert.ok(result.estimatedMonths > 0);
});

test('projectHIndex: no growth never reaches unreachable target within cap', () => {
  const result = projectHIndex({
    currentCitations: [1],
    targetH: 50,
    monthlyCitationRate: 0,
    papersPerYear: 0,
    maxMonths: 12,
  });
  assert.strictEqual(result.reached, false);
  assert.strictEqual(result.estimatedMonths, null);
});

test('projectHIndex: higher venue multiplier reaches target no slower than baseline', () => {
  const params = {
    currentCitations: [1, 1],
    targetH: 6,
    monthlyCitationRate: 1,
    papersPerYear: 6,
    maxMonths: 60,
  };
  const baseline = projectHIndex(params);
  const boosted = projectHIndex({ ...params, newPaperCitationMultiplier: 3 });
  assert.strictEqual(baseline.reached, true);
  assert.strictEqual(boosted.reached, true);
  assert.ok(boosted.estimatedMonths <= baseline.estimatedMonths);
});

test('venueTiers: getMultiplier returns 1 for unknown/average tier', () => {
  assert.strictEqual(getMultiplier('average'), 1.0);
  assert.strictEqual(getMultiplier('nonexistent'), 1.0);
});

test('venueTiers: getMultiplier returns higher value for top tier', () => {
  assert.ok(getMultiplier('top') > getMultiplier('average'));
});

test('venueTiers: getTierForVenue matches known venues', () => {
  assert.strictEqual(getTierForVenue('Nature Communications'), 'top');
  assert.strictEqual(getTierForVenue('NeurIPS'), 'top');
  assert.strictEqual(getTierForVenue('KDD'), 'strong');
  assert.strictEqual(getTierForVenue('Some Random Workshop'), 'emerging');
  assert.strictEqual(getTierForVenue('Totally Unknown Venue'), null);
});

// ---------------------------------------------------------------------------
// Age-aware "real" citation model (currentPaperYears) — see
// utils/prediction.js's ageGrowthMultiplier for the rationale.
// ---------------------------------------------------------------------------

test('ageGrowthMultiplier: rises from a slow start to a peak, then tapers into a long tail', () => {
  const freshlyPublished = ageGrowthMultiplier(0.2);
  const peakYears = ageGrowthMultiplier(3);
  const oldPaper = ageGrowthMultiplier(15);

  assert.ok(freshlyPublished < peakYears, 'a brand-new paper should grow slower than a paper at its citation peak');
  assert.ok(oldPaper < peakYears, 'a very old paper should grow slower than a paper at its citation peak');
  assert.ok(oldPaper > 0, 'even a very old paper keeps a small long-tail multiplier, never zero');
});

test('projectHIndex: omitting currentPaperYears keeps the old flat-rate behavior for existing papers', () => {
  // papersPerYear: 0 -- no new papers get added mid-simulation (so h-index
  // is capped at the existing paper count -- 5 papers here, well above the
  // target of 5 so it's reachable through growth alone), isolating the
  // "unknown-age existing paper" case: with no years array at all, and with
  // an all-null years array, every existing paper's rate should be
  // identical (flat, no age scaling either way).
  const shared = {
    currentCitations: [3, 3, 3, 3, 3],
    targetH: 5,
    monthlyCitationRate: 2,
    papersPerYear: 0,
    maxMonths: 60,
  };
  const withoutYears = projectHIndex(shared);
  const withNullYears = projectHIndex({ ...shared, currentPaperYears: [null, null, null, null, null] });

  assert.strictEqual(withoutYears.reached, true);
  assert.strictEqual(withoutYears.estimatedMonths, withNullYears.estimatedMonths);
});

test('projectHIndex: real mode still age-scales newly-added papers even when existing papers have unknown years', () => {
  // Existing papers' years are unknown (null -> flat rate), but any paper
  // added mid-simulation has a known birth year (the simulated month it was
  // "published" in), so it should still ramp up through the slow-start
  // curve rather than getting an instant flat rate like the no-years-at-all
  // case does.
  const shared = {
    currentCitations: [3, 2, 1],
    targetH: 8,
    monthlyCitationRate: 2,
    papersPerYear: 4,
    maxMonths: 60,
  };
  const withoutYears = projectHIndex(shared);
  const withNullYears = projectHIndex({ ...shared, currentPaperYears: [null, null, null] });

  assert.strictEqual(withoutYears.reached, true);
  assert.strictEqual(withNullYears.reached, true);
  assert.ok(
    withNullYears.estimatedMonths >= withoutYears.estimatedMonths,
    'newly-added papers ramping up through the slow-start curve should take at least as long as an instant flat rate'
  );
});

test('projectHIndex: real mode reaches a target no faster than the idealized flat-rate model', () => {
  // A freshly-published paper set (all published "this year") starts deep
  // in the slow-ramp-up part of the curve (multiplier < 1 for the first
  // year), so the real model should take at least as long to hit the same
  // target as the flat-rate model at the same base rate.
  const currentYear = 2026;
  const shared = {
    currentCitations: [1, 1, 1],
    targetH: 4,
    monthlyCitationRate: 1,
    papersPerYear: 3,
    maxMonths: 120,
    currentYear,
  };

  const flat = projectHIndex(shared);
  const real = projectHIndex({ ...shared, currentPaperYears: [currentYear, currentYear, currentYear] });

  assert.strictEqual(flat.reached, true);
  assert.strictEqual(real.reached, true);
  assert.ok(real.estimatedMonths >= flat.estimatedMonths);
});

test('projectHIndex: real mode lets an already-mature paper set reach target faster than a freshly-published one', () => {
  const currentYear = 2026;
  const base = {
    currentCitations: [1, 1, 1, 1],
    targetH: 6,
    monthlyCitationRate: 1,
    papersPerYear: 2,
    maxMonths: 120,
    currentYear,
  };

  const freshlyPublished = projectHIndex({ ...base, currentPaperYears: [currentYear, currentYear, currentYear, currentYear] });
  const alreadyMature = projectHIndex({
    ...base,
    // Published 3 years ago -- sitting right in the peak citation window.
    currentPaperYears: [currentYear - 3, currentYear - 3, currentYear - 3, currentYear - 3],
  });

  assert.strictEqual(freshlyPublished.reached, true);
  assert.strictEqual(alreadyMature.reached, true);
  assert.ok(alreadyMature.estimatedMonths <= freshlyPublished.estimatedMonths);
});
