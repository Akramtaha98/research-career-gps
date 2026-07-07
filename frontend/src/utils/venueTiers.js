// Mirrors backend/utils/venueTiers.js — see that file for the important
// caveat: this is a small hand-curated heuristic, NOT a real journal
// impact-factor/SJR database.
export const TIERS = {
  top: { label: 'Top (Nature/Science/NeurIPS-tier)', multiplier: 3.0 },
  strong: { label: 'Strong (solid field-leading venue)', multiplier: 2.0 },
  average: { label: 'Average (typical peer-reviewed venue)', multiplier: 1.0 },
  emerging: { label: 'Emerging/workshop', multiplier: 0.5 },
};

const VENUE_MULTIPLIERS = [
  { pattern: /nature|^science$|cell\b/i, tier: 'top' },
  { pattern: /neurips|nips|icml|iclr|cvpr|acl\b/i, tier: 'top' },
  { pattern: /aaai|ijcai|emnlp|kdd|www\b|sigir|eccv|iccv/i, tier: 'strong' },
  { pattern: /workshop|arxiv preprint/i, tier: 'emerging' },
];

export function getTierForVenue(venueName) {
  if (!venueName) return null;
  const match = VENUE_MULTIPLIERS.find((v) => v.pattern.test(venueName));
  return match ? match.tier : null;
}

export function getMultiplier(tierKey) {
  return TIERS[tierKey]?.multiplier ?? 1.0;
}
