import { describe, it, expect } from 'vitest';
import { computeHIndexFrontier } from './frontier';

describe('computeHIndexFrontier', () => {
  it('handles the multi-paper-needed case from the function\'s own doc comment', () => {
    const papers = [12, 10, 8, 8, 7, 6, 5, 4].map((citations, i) => ({
      id: `p${i}`,
      title: `Paper ${i}`,
      citations,
    }));

    const result = computeHIndexFrontier(papers);

    expect(result.currentHIndex).toBe(6);
    expect(result.nextThreshold).toBe(7);
    // Five papers already have >= 7 citations (12,10,8,8,7); two more need
    // to cross that line to reach h=7.
    expect(result.papersNeeded).toBe(2);
    expect(result.candidates.map((c) => c.citationsNeeded)).toEqual([1, 2]);
    expect(result.papersNeededFromNewWork).toBe(0);
  });

  it('reports new-work-needed when there are not enough existing papers to close the gap', () => {
    // Only 2 papers total, both already contributing to h=2 -- reaching
    // h=3 needs a THIRD paper to exist at all, not just more citations on
    // what's here.
    const papers = [
      { id: 'a', title: 'A', citations: 5 },
      { id: 'b', title: 'B', citations: 5 },
    ];
    const result = computeHIndexFrontier(papers);
    expect(result.currentHIndex).toBe(2);
    expect(result.nextThreshold).toBe(3);
    expect(result.papersNeededFromNewWork).toBeGreaterThan(0);
  });

  it('handles an empty paper list without throwing', () => {
    const result = computeHIndexFrontier([]);
    expect(result.currentHIndex).toBe(0);
    expect(result.corePapers).toEqual([]);
  });
});
