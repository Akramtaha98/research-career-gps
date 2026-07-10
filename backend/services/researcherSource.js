/**
 * Orchestrates which upstream data source backs a researcher lookup.
 *
 * Semantic Scholar is PRIMARY: tried first for every search and every
 * profile fetch. OpenAlex is the FALLBACK, used only when Semantic Scholar
 * errors, is rate-limited, or returns nothing — and also used as a
 * best-effort enrichment source afterward (see fetchAuthorProfile below),
 * since OpenAlex's ORCID-filtered works fetch (see openAlex.js) often has
 * papers Semantic Scholar's own index is missing, and carries per-year
 * citation breakdowns (`countsByYear`) Semantic Scholar's payload doesn't.
 *
 * Every candidate/profile carries a `source` tag ('semantic_scholar' | 'openalex')
 * so the caller always knows which service to go back to for refresh/history/
 * collaborators — the two services' IDs are not interchangeable.
 */
const openAlex = require('./openAlex');
const semanticScholar = require('./semanticScholar');
const { calculateHIndex } = require('../utils/hIndex');

// Matches a bare ORCID iD, with or without the "https://orcid.org/" prefix a
// user might paste in — same shape openAlex.js/verificationService.js use.
const ORCID_RE = /^(?:https?:\/\/orcid\.org\/)?(\d{4}-\d{4}-\d{4}-\d{3}[\dXx])$/;

function normalizeOrcid(query) {
  const match = String(query).trim().match(ORCID_RE);
  return match ? match[1].toUpperCase() : null;
}

async function searchAuthors(query) {
  const orcid = normalizeOrcid(query);
  if (orcid) {
    // ORCID-formatted input — go straight to an exact-ORCID lookup on each
    // service rather than a fuzzy name search (Semantic Scholar's general
    // search endpoint doesn't support ORCID input at all). Semantic Scholar
    // first (primary), OpenAlex's own ORCID-aware searchAuthors as fallback
    // when Semantic Scholar has no record for it.
    const ssProfile = await semanticScholar.fetchAuthorProfileByOrcid(orcid);
    if (ssProfile) {
      return [
        {
          semanticScholarId: ssProfile.semanticScholarId,
          source: 'semantic_scholar',
          name: ssProfile.name,
          affiliations: ssProfile.affiliations || [],
          homepage: null,
          orcid,
          paperCount: ssProfile.paperCount,
          citationCount: ssProfile.totalCitations,
          hIndex: ssProfile.hIndex,
        },
      ];
    }
    try {
      const oaResults = await openAlex.searchAuthors(orcid);
      if (oaResults.length > 0) return oaResults;
    } catch {
      // Both sources have nothing for this ORCID — fall through to return [].
    }
    return [];
  }

  // Name-based search: Semantic Scholar first, OpenAlex as fallback.
  try {
    const results = await semanticScholar.searchAuthors(query);
    if (results.length > 0) return results;
  } catch (err) {
    // Swallow and fall through to OpenAlex — Semantic Scholar being down or
    // rate-limited shouldn't take search down with it.
  }

  try {
    return await openAlex.searchAuthors(query);
  } catch (err) {
    const wrapped = new Error(`Search failed on both Semantic Scholar and OpenAlex: ${err.message}`);
    wrapped.statusCode = err.statusCode || 502;
    throw wrapped;
  }
}

/** "10.1000/Some-DOI" -> "10.1000/some-doi" (already-normalized OpenAlex/S2 DOIs, just guards case) */
function normalizeDoi(doi) {
  return doi ? doi.trim().toLowerCase() : null;
}

/**
 * Loose title match key: lowercase, strip punctuation/whitespace differences,
 * so "Deep Learning for X: A Survey" and "Deep learning for X. A survey"
 * collapse to the same key. Used only as a fallback when neither paper has a
 * DOI — DOI match is preferred and far more reliable.
 */
function titleKey(title) {
  return (title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Merges OpenAlex's paper list with Semantic Scholar's for the same person
 * (bridged via ORCID), so gaps in either source's coverage get filled in.
 * This directly targets the "split author entity" case the user hit
 * ("Akram Taha Zeyad" vs "Akram T. Zeyad" showing up as two incomplete
 * OpenAlex authors): OpenAlex's ORCID-filtered works fetch already reunites
 * most of that (see openAlex.js), but Semantic Scholar's own name
 * disambiguation sometimes catches papers OpenAlex's index doesn't have yet,
 * so this fills in the remainder rather than picking one source over the
 * other.
 *
 * OpenAlex's paper is kept as the "base" whenever a paper exists in both
 * (it carries `countsByYear`, needed for the yearly-history chart, which
 * Semantic Scholar's payload doesn't have) — Semantic Scholar papers are only
 * ADDED for titles/DOIs OpenAlex doesn't already have.
 */
function mergePapers(basePapers, extraPapers) {
  const byDoi = new Map();
  const byTitle = new Map();
  for (const p of basePapers) {
    if (p.doi) byDoi.set(normalizeDoi(p.doi), p);
    byTitle.set(titleKey(p.title), p);
  }

  const merged = [...basePapers];
  let addedCount = 0;
  for (const p of extraPapers) {
    const doiKey = normalizeDoi(p.doi);
    const tKey = titleKey(p.title);
    const alreadyHave = (doiKey && byDoi.has(doiKey)) || byTitle.has(tKey);
    if (alreadyHave) continue;
    merged.push({ ...p, countsByYear: [] }); // no per-year breakdown available from Semantic Scholar
    if (doiKey) byDoi.set(doiKey, p);
    byTitle.set(tKey, p);
    addedCount += 1;
  }

  return { merged, addedCount };
}

/** Best-effort OpenAlex lookup by ORCID — two-step search-then-fetch since OpenAlex has no direct "profile by ORCID" endpoint. Never throws; returns null on any failure. */
async function fetchOpenAlexProfileByOrcid(orcid) {
  try {
    const candidates = await openAlex.searchAuthors(orcid);
    if (!candidates.length) return null;
    return await openAlex.fetchAuthorProfile(candidates[0].semanticScholarId);
  } catch {
    return null;
  }
}

/**
 * @param {string} id - the ID as returned by searchAuthors (Semantic Scholar
 *   numeric author ID, or OpenAlex short ID)
 * @param {string} [source] - 'semantic_scholar' | 'openalex'. Defaults to
 *   'semantic_scholar', the primary source.
 */
async function fetchAuthorProfile(id, source = 'semantic_scholar') {
  if (source === 'openalex') {
    const primary = await openAlex.fetchAuthorProfile(id);
    if (!primary.orcid) return primary;

    // Best-effort enrichment only — Semantic Scholar's confirmed rate limits
    // mean this can fail (429/timeout) without the page load being blocked;
    // fetchAuthorProfileByOrcid already swallows all errors and returns null.
    const enrichment = await semanticScholar.fetchAuthorProfileByOrcid(primary.orcid);
    if (!enrichment || enrichment.papers.length === 0) return primary;

    const { merged, addedCount } = mergePapers(primary.papers, enrichment.papers);
    if (addedCount === 0) return primary;

    const citations = merged.map((p) => p.citations);
    return {
      ...primary,
      hIndex: calculateHIndex(citations),
      totalCitations: citations.reduce((a, b) => a + b, 0),
      paperCount: merged.length,
      papers: merged,
      mergedWithSemanticScholar: true, // lets the frontend note "+N papers found via Semantic Scholar" if desired
    };
  }

  // source === 'semantic_scholar' (the primary path)
  const primary = await semanticScholar.fetchAuthorProfile(id);
  if (!primary.orcid) return primary;

  // Best-effort enrichment from OpenAlex — never blocks the page load on
  // failure (fetchOpenAlexProfileByOrcid swallows all errors).
  const enrichment = await fetchOpenAlexProfileByOrcid(primary.orcid);
  if (!enrichment || enrichment.papers.length === 0) return primary;

  // OpenAlex's paper representation is kept as the merge "base" (it carries
  // countsByYear, needed for the yearly-history chart, which Semantic
  // Scholar's payload doesn't have) — Semantic Scholar's papers are only
  // ADDED for titles/DOIs OpenAlex doesn't already have. Same reasoning as
  // the 'openalex'-source branch above, just triggered from the other side.
  const { merged, addedCount } = mergePapers(enrichment.papers, primary.papers);
  if (addedCount === 0 && merged.length <= primary.papers.length) return primary;

  const citations = merged.map((p) => p.citations);
  return {
    ...primary,
    hIndex: calculateHIndex(citations),
    totalCitations: citations.reduce((a, b) => a + b, 0),
    paperCount: merged.length,
    papers: merged,
    mergedWithOpenAlex: true, // lets the frontend note "+N papers found via OpenAlex" if desired
  };
}

module.exports = { searchAuthors, fetchAuthorProfile };
