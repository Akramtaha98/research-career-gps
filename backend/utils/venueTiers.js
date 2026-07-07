/**
 * Rough, hand-maintained venue-tier multipliers for the prediction engine.
 *
 * IMPORTANT: this is NOT a real journal impact-factor or SJR/quartile
 * database — those require a paid license (Clarivate/Scimago). This is a
 * small curated list of well-known venues mapped to a coarse "how much
 * faster do papers here tend to accumulate citations" multiplier, plus a
 * generic tier fallback for anything else. Treat it as a directional
 * heuristic, not ground truth, and feel free to edit VENUE_MULTIPLIERS
 * directly to reflect your own field.
 */
const TIERS = {
  top: { label: 'Top (Nature/Science/NeurIPS-tier)', multiplier: 3.0 },
  strong: { label: 'Strong (solid field-leading venue)', multiplier: 2.0 },
  average: { label: 'Average (typical peer-reviewed venue)', multiplier: 1.0 },
  emerging: { label: 'Emerging/workshop', multiplier: 0.5 },
};

// Case-insensitive substring match against paper venue names.
const VENUE_MULTIPLIERS = [
  { pattern: /nature|^science$|cell\b/i, tier: 'top' },
  { pattern: /neurips|nips|icml|iclr|cvpr|acl\b/i, tier: 'top' },
  { pattern: /aaai|ijcai|emnlp|kdd|www\b|sigir|eccv|iccv/i, tier: 'strong' },
  { pattern: /workshop|arxiv preprint/i, tier: 'emerging' },
];

function getTierForVenue(venueName) {
  if (!venueName) return null;
  const match = VENUE_MULTIPLIERS.find((v) => v.pattern.test(venueName));
  return match ? match.tier : null;
}

function getMultiplier(tierKey) {
  return TIERS[tierKey]?.multiplier ?? 1.0;
}

module.exports = { TIERS, getTierForVenue, getMultiplier };
