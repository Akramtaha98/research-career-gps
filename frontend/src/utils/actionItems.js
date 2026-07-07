import { calculateHIndex } from './prediction';

export function generateActionItems({ papers }) {
  const citations = papers.map((p) => p.citations || 0);
  const h = calculateHIndex(citations);
  const items = [];

  const sorted = [...papers].sort((a, b) => (b.citations || 0) - (a.citations || 0));
  const nearMiss = sorted.filter((p, idx) => {
    const rank = idx + 1;
    const c = p.citations || 0;
    return rank > h && c > 0 && h + 1 - c <= 5 && h + 1 - c > 0;
  });

  nearMiss.slice(0, 5).forEach((p) => {
    const needed = h + 1 - (p.citations || 0);
    items.push({
      type: 'near_miss_paper',
      priority: 'high',
      title: `Promote "${p.title}"`,
      description: `Only ${needed} more citation${needed === 1 ? '' : 's'} needed to help push your H-index to ${h + 1}. Share it, present it, or cite it in upcoming work.`,
    });
  });

  const lowCitation = papers.filter((p) => (p.citations || 0) <= 1);
  if (lowCitation.length > 0) {
    items.push({
      type: 'collaboration',
      priority: 'medium',
      title: 'Boost visibility of low-citation papers',
      description: `${lowCitation.length} of your papers have 0-1 citations. Consider co-authoring follow-ups or posting preprints to relevant communities.`,
    });
  }

  items.push({
    type: 'venue_strategy',
    priority: 'medium',
    title: 'Target higher-impact venues',
    description: 'Prioritize your strongest work-in-progress for the highest-impact venue in your subfield.',
  });

  const recentYears = papers.map((p) => p.year).filter(Boolean);
  const currentYear = new Date().getFullYear();
  const recentCount = recentYears.filter((y) => y >= currentYear - 2).length;
  if (recentCount < 2) {
    items.push({
      type: 'output_cadence',
      priority: 'high',
      title: 'Increase publication cadence',
      description: `You've published ${recentCount} paper(s) in the last 2 years. Aim for 2-3 submissions per year for sustained growth.`,
    });
  }

  items.push({
    type: 'priority_summary',
    priority: 'info',
    title: `Current H-index: ${h}`,
    description: `${papers.length} tracked papers. Focus on near-miss papers first, then output cadence and venue strategy.`,
  });

  const rank = { high: 0, medium: 1, low: 2, info: 3 };
  return items.sort((a, b) => rank[a.priority] - rank[b.priority]);
}
