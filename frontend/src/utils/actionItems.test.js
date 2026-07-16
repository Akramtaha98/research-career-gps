import { describe, it, expect } from 'vitest';
import { generateActionItems } from './actionItems';

describe('generateActionItems', () => {
  it('flags a near-miss paper close to pushing the H-index up', () => {
    // h=3 for [10,8,5,1]; the 4th paper (1 citation) is not a near miss,
    // but a paper with e.g. 3 citations at rank 4 would need only 1 more to
    // reach the h+1=4 threshold.
    const papers = [
      { id: '1', title: 'Big Hit', citations: 10, year: 2020 },
      { id: '2', title: 'Solid', citations: 8, year: 2021 },
      { id: '3', title: 'Okay', citations: 5, year: 2022 },
      { id: '4', title: 'Close One', citations: 3, year: 2023 },
    ];
    const items = generateActionItems({ papers });
    const nearMiss = items.find((i) => i.type === 'near_miss_paper');
    expect(nearMiss).toBeDefined();
    expect(nearMiss.meta.paperTitle).toBe('Close One');
    expect(nearMiss.meta.needed).toBe(1);
  });

  it('flags low-citation papers for a collaboration/visibility push', () => {
    const papers = [
      { id: '1', title: 'A', citations: 0, year: 2024 },
      { id: '2', title: 'B', citations: 1, year: 2024 },
      { id: '3', title: 'C', citations: 20, year: 2020 },
    ];
    const items = generateActionItems({ papers });
    const lowCitation = items.find((i) => i.type === 'collaboration');
    expect(lowCitation).toBeDefined();
    expect(lowCitation.descParams.count).toBe(2);
  });

  it('flags a slow recent publication cadence', () => {
    const papers = [{ id: '1', title: 'Old Paper', citations: 50, year: 2015 }];
    const items = generateActionItems({ papers });
    const cadence = items.find((i) => i.type === 'output_cadence');
    expect(cadence).toBeDefined();
  });

  it('always includes a priority summary and sorts high-priority items first', () => {
    const papers = [{ id: '1', title: 'Solo Paper', citations: 2, year: 2015 }];
    const items = generateActionItems({ papers });
    expect(items.some((i) => i.type === 'priority_summary')).toBe(true);

    const priorityRank = { high: 0, medium: 1, low: 2, info: 3 };
    const ranks = items.map((i) => priorityRank[i.priority]);
    const sorted = [...ranks].sort((a, b) => a - b);
    expect(ranks).toEqual(sorted);
  });
});
