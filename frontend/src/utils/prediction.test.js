import { describe, it, expect } from 'vitest';
import { calculateHIndex, ageGrowthMultiplier, projectHIndex } from './prediction';

describe('calculateHIndex', () => {
  it('computes the standard example', () => {
    expect(calculateHIndex([10, 8, 5, 1])).toBe(3);
  });

  it('returns 0 for an empty list', () => {
    expect(calculateHIndex([])).toBe(0);
  });
});

describe('ageGrowthMultiplier', () => {
  it('ramps up from a slow start to a peak, then tapers into a long tail', () => {
    const fresh = ageGrowthMultiplier(0.2);
    const peak = ageGrowthMultiplier(3);
    const old = ageGrowthMultiplier(15);
    expect(fresh).toBeLessThan(peak);
    expect(old).toBeLessThan(peak);
    expect(old).toBeGreaterThan(0);
  });
});

describe('projectHIndex', () => {
  it('returns 0 months when already at target', () => {
    const result = projectHIndex({
      currentCitations: [10, 8, 5, 1],
      targetH: 3,
      monthlyCitationRate: 1,
      papersPerYear: 2,
    });
    expect(result.estimatedMonths).toBe(0);
    expect(result.reached).toBe(true);
  });

  it('matches the backend flat-rate model when currentPaperYears is omitted', () => {
    const result = projectHIndex({
      currentCitations: [3, 2, 1],
      targetH: 5,
      monthlyCitationRate: 2,
      papersPerYear: 4,
      maxMonths: 60,
    });
    expect(result.reached).toBe(true);
    expect(result.estimatedMonths).toBeGreaterThan(0);
  });

  it('lets an already-mature paper set reach target no slower than a freshly-published one (real mode)', () => {
    const currentYear = 2026;
    const base = {
      currentCitations: [1, 1, 1, 1],
      targetH: 6,
      monthlyCitationRate: 1,
      papersPerYear: 2,
      maxMonths: 120,
      currentYear,
    };
    const fresh = projectHIndex({ ...base, currentPaperYears: [currentYear, currentYear, currentYear, currentYear] });
    const mature = projectHIndex({
      ...base,
      currentPaperYears: [currentYear - 3, currentYear - 3, currentYear - 3, currentYear - 3],
    });
    expect(fresh.reached).toBe(true);
    expect(mature.reached).toBe(true);
    expect(mature.estimatedMonths).toBeLessThanOrEqual(fresh.estimatedMonths);
  });
});
