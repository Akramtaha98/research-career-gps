/**
 * Decides which numbers the Dashboard should actually show as the headline
 * H-index / citations / paper count, given three possible sources:
 *
 *   1. The community/shared pool (see backend/schema.sql's shared_scores) —
 *      may be 'verified' (the researcher's own ORCID-confirmed account
 *      submitted it) or 'unverified' (anyone else's submission).
 *   2. This user's own PRIVATE self-reported Scopus/WOS entry on the
 *      researcher row (scopus_h_index/scopus_paper_count/scopus_citations,
 *      and the wos_* equivalents).
 *   3. The raw OpenAlex/Semantic Scholar snapshot (researcher.h_index etc.) —
 *      always present, the ultimate fallback.
 *
 * Per the user's explicit choice, Scopus is the "base" source: if there's
 * ANY Scopus data at all (private or shared), the headline numbers come from
 * Scopus; only if there's no Scopus data anywhere does WOS take over; only if
 * neither exists do we fall back to the raw OpenAlex/Semantic Scholar
 * numbers. Within whichever source wins, a verified shared value beats this
 * user's private entry, which beats an unverified shared value — and any
 * individual field left blank (e.g. citations never filled in) falls back to
 * the raw snapshot for JUST that field, so the Dashboard never shows a blank
 * where a real (if less authoritative) number is available.
 *
 * @param {object} researcher - the researcher row (h_index, total_citations,
 *   paper_count, scopus_h_index, scopus_paper_count, scopus_citations,
 *   wos_h_index, wos_paper_count, wos_citations, ...)
 * @param {{orcid: string|null, scopus: object|null, wos: object|null}|null} sharedScores
 * @returns {{
 *   source: 'scopus'|'wos'|'raw',
 *   verified: boolean,
 *   hIndex: number,
 *   totalCitations: number,
 *   paperCount: number,
 *   hIndexIsRaw: boolean,
 *   totalCitationsIsRaw: boolean,
 *   paperCountIsRaw: boolean,
 * }}
 */
export function computeEffectiveMetrics(researcher, sharedScores) {
  const raw = {
    hIndex: researcher.h_index,
    totalCitations: researcher.total_citations,
    paperCount: researcher.paper_count,
  };

  const hasScopus = researcher.scopus_h_index != null || Boolean(sharedScores?.scopus);
  const hasWos = researcher.wos_h_index != null || Boolean(sharedScores?.wos);

  const primarySource = hasScopus ? 'scopus' : hasWos ? 'wos' : 'raw';
  if (primarySource === 'raw') {
    return {
      source: 'raw',
      verified: false,
      ...raw,
      hIndexIsRaw: true,
      totalCitationsIsRaw: true,
      paperCountIsRaw: true,
    };
  }

  const shared = sharedScores?.[primarySource] || null;
  const verifiedShared = shared?.status === 'verified' ? shared : null;
  const unverifiedShared = shared?.status === 'unverified' ? shared : null;
  const private_ = {
    hIndex: researcher[`${primarySource}_h_index`],
    paperCount: researcher[`${primarySource}_paper_count`],
    citations: researcher[`${primarySource}_citations`],
  };

  function pickField(field, sharedField) {
    if (verifiedShared && verifiedShared[sharedField] != null) return { value: verifiedShared[sharedField], isRaw: false };
    if (private_[field] != null) return { value: private_[field], isRaw: false };
    if (unverifiedShared && unverifiedShared[sharedField] != null) return { value: unverifiedShared[sharedField], isRaw: false };
    return { value: raw[field === 'citations' ? 'totalCitations' : field === 'hIndex' ? 'hIndex' : 'paperCount'], isRaw: true };
  }

  const hIndexPick = pickField('hIndex', 'h_index');
  const citationsPick = pickField('citations', 'citations');
  const paperCountPick = pickField('paperCount', 'paper_count');

  return {
    source: primarySource,
    verified: Boolean(verifiedShared),
    hIndex: hIndexPick.value,
    totalCitations: citationsPick.value,
    paperCount: paperCountPick.value,
    hIndexIsRaw: hIndexPick.isRaw,
    totalCitationsIsRaw: citationsPick.isRaw,
    paperCountIsRaw: paperCountPick.isRaw,
  };
}
