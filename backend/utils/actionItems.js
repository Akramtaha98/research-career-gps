const { calculateHIndex } = require('./hIndex');

/**
 * Generate auto-recommendations based on a researcher's current paper set.
 * Heuristic, not ML — good enough for an MVP action-items page.
 */
function generateActionItems({ papers }) {
  const citations = papers.map((p) => p.citations || 0);
  const h = calculateHIndex(citations);
  const items = [];

  // 1) Papers just below the H-index threshold — cheapest wins.
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
      description: `Only ${needed} more citation${needed === 1 ? '' : 's'} needed on this paper to help push your H-index to ${h + 1}. Share it on social media, present it at a conference, or cite it in your next paper's related work.`,
      paperId: p.id,
    });
  });

  // 2) Zero/low-citation papers — collaboration & visibility push.
  const lowCitation = papers.filter((p) => (p.citations || 0) <= 1);
  if (lowCitation.length > 0) {
    items.push({
      type: 'collaboration',
      priority: 'medium',
      title: 'Boost visibility of low-citation papers',
      description: `${lowCitation.length} of your papers have 0-1 citations. Consider co-authoring follow-up work, posting preprints to relevant communities, or reaching out to labs doing adjacent work to increase discoverability.`,
    });
  }

  // 3) High-impact venue suggestion.
  items.push({
    type: 'venue_strategy',
    priority: 'medium',
    title: 'Target higher-impact venues for upcoming submissions',
    description:
      'Papers published in top-tier, high-visibility venues accumulate citations faster. Prioritize submitting your strongest current work-in-progress to the highest-impact venue in your subfield rather than splitting it across smaller ones.',
  });

  // 4) Publication cadence.
  const recentYears = papers.map((p) => p.year).filter(Boolean);
  const currentYear = new Date().getFullYear();
  const recentCount = recentYears.filter((y) => y >= currentYear - 2).length;
  if (recentCount < 2) {
    items.push({
      type: 'output_cadence',
      priority: 'high',
      title: 'Increase publication cadence',
      description: `You've published ${recentCount} paper(s) in the last 2 years. Sustained H-index growth needs both new papers and citation accumulation on existing ones. Aim for at least 2-3 submissions per year.`,
    });
  }

  // 5) General priority ranking.
  items.push({
    type: 'priority_summary',
    priority: 'info',
    title: `Current H-index: ${h}`,
    description: `You have ${papers.length} tracked papers. Focus first on "near miss" papers (fastest H-index gains), then on sustained output and venue strategy for long-term growth.`,
  });

  const rank = { high: 0, medium: 1, low: 2, info: 3 };
  return items.sort((a, b) => rank[a.priority] - rank[b.priority]);
}

module.exports = { generateActionItems };
