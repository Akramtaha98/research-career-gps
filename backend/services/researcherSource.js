/**
 * Orchestrates which upstream data source backs a researcher lookup.
 *
 * OpenAlex is PRIMARY: free, no API key, no IP-based entitlement gate (unlike
 * Scopus/WOS — see openAlex.js and historicalHIndex.js comments for the full
 * story on why). Semantic Scholar is the FALLBACK, used only when OpenAlex
 * errors or returns nothing for a search.
 *
 * Every candidate/profile carries a `source` tag ('openalex' | 'semantic_scholar')
 * so the caller always knows which service to go back to for refresh/history/
 * collaborators — the two services' IDs are not interchangeable.
 */
const openAlex = require('./openAlex');
const semanticScholar = require('./semanticScholar');
const { calculateHIndex } = require('../utils/hIndex');

async function searchAuthors(query) {
  try {
    const results = await openAlex.searchAuthors(query);
    if (results.length > 0) return results;
  } catch (err) {
    // Swallow and fall through to Semantic Scholar — OpenAlex being down
    // shouldn't take search down with it.
  }

  try {
    return await semanticScholar.searchAuthors(query);
  } catch (err) {
    const wrapped = new Error(`Search failed on both OpenAlex and Semantic Scholar: ${err.message}`);
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

/**
 * @param {string} id - the ID as returned by searchAuthors (OpenAlex short ID
 *   or Semantic Scholar numeric author ID)
 * @param {string} [source] - 'openalex' | 'semantic_scholar'. Defaults to
 *   'semantic_scholar' for backward compatibility with the direct-numeric-ID
 *   search path, which predates this multi-source setup.
 */
async function fetchAuthorProfile(id, source = 'semantic_scholar') {
  if (source !== 'openalex') return semanticScholar.fetchAuthorProfile(id);

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

module.exports = { searchAuthors, fetchAuthorProfile };
