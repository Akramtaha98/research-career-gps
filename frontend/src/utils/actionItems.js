import { calculateHIndex } from './prediction';

/**
 * Generates prioritized action items. Returns translation keys + params
 * instead of baked-in English strings, so the UI layer can render them in
 * whichever language is active (see src/i18n.js, locales/*.json under the
 * "actionItems" namespace).
 */
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
      titleKey: 'actionItems.nearMiss.title',
      titleParams: { title: p.title },
      descKey: 'actionItems.nearMiss.desc',
      descParams: { count: needed, next: h + 1 },
      // Raw values for UI that wants to build its own layout (e.g. the
      // priority highlight card) instead of the pre-formatted sentence.
      meta: { paperTitle: p.title, needed, nextH: h + 1, currentH: h },
    });
  });

  const lowCitation = papers.filter((p) => (p.citations || 0) <= 1);
  if (lowCitation.length > 0) {
    items.push({
      type: 'collaboration',
      priority: 'medium',
      titleKey: 'actionItems.lowCitation.title',
      descKey: 'actionItems.lowCitation.desc',
      descParams: { count: lowCitation.length },
    });
  }

  items.push({
    type: 'venue_strategy',
    priority: 'medium',
    titleKey: 'actionItems.venueStrategy.title',
    descKey: 'actionItems.venueStrategy.desc',
  });

  const recentYears = papers.map((p) => p.year).filter(Boolean);
  const currentYear = new Date().getFullYear();
  const recentCount = recentYears.filter((y) => y >= currentYear - 2).length;
  if (recentCount < 2) {
    items.push({
      type: 'output_cadence',
      priority: 'high',
      titleKey: 'actionItems.outputCadence.title',
      descKey: 'actionItems.outputCadence.desc',
      descParams: { count: recentCount },
    });
  }

  items.push({
    type: 'priority_summary',
    priority: 'info',
    titleKey: 'actionItems.summary.title',
    titleParams: { h },
    descKey: 'actionItems.summary.desc',
    descParams: { count: papers.length },
  });

  const rank = { high: 0, medium: 1, low: 2, info: 3 };
  return items.sort((a, b) => rank[a.priority] - rank[b.priority]);
}
