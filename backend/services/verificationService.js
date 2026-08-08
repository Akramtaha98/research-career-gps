/**
 * Standalone academic-information VERIFICATION pipeline: given an ORCID iD
 * plus whatever an author claims about themselves, resolves the real
 * profile and every real paper for that ORCID, then produces a field-by-
 * field comparison. Pure "go verify this" logic — persistence lives in
 * services/store.js (saveVerificationRun), keeping this module easy to test
 * in isolation.
 *
 * Source priority: SEMANTIC SCHOLAR FIRST, OpenAlex only as a fallback (see
 * resolveAuthorProfile below for exactly when the fallback triggers). This
 * is the opposite priority from researcherSource.js's Dashboard-tracking
 * pipeline (OpenAlex primary there) — a deliberate, separate choice for this
 * feature.
 */
const semanticScholar = require('./semanticScholar');
const openAlex = require('./openAlex');

// Matches a bare ORCID iD, with or without the "https://orcid.org/" prefix a
// user might paste in (16 digits, optionally dashed, last character can be
// X) — same shape both upstream services use.
const ORCID_RE = /^(?:https?:\/\/orcid\.org\/)?(\d{4}-\d{4}-\d{4}-\d{3}[\dXx])$/;

function normalizeOrcid(input) {
  if (!input) return null;
  const match = String(input).trim().match(ORCID_RE);
  return match ? match[1].toUpperCase() : null;
}

/**
 * OpenAlex has no direct "fetch profile by ORCID" endpoint the way Semantic
 * Scholar does — it's a two-step search-then-fetch, same pattern
 * researcherSource.js/Search.jsx already use for the Dashboard flow. Any
 * failure (no match, network error) resolves to null so the caller can
 * report the whole lookup as unverifiable rather than throwing.
 */
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
 * Resolves a full author profile (name, affiliations, aggregate metrics, and
 * every paper) for an ORCID. Semantic Scholar is tried FIRST; OpenAlex is
 * only queried as a fallback when:
 *   (a) Semantic Scholar has no record at all for this ORCID (404/timeout —
 *       fetchAuthorProfileByOrcid returns null on any failure), or
 *   (b) Semantic Scholar resolves the author but with zero papers attached —
 *       a strong signal this ORCID isn't well-indexed there, where
 *       OpenAlex's ORCID-based works filter (see openAlex.js
 *       fetchAuthorProfile) tends to have fuller coverage.
 * If OpenAlex also comes up empty in case (b), the thin Semantic Scholar
 * result is used anyway rather than discarding it.
 */
async function resolveAuthorProfile(orcid) {
  const primary = await semanticScholar.fetchAuthorProfileByOrcid(orcid);

  if (primary && primary.paperCount > 0) {
    return { profile: primary, source: 'semantic_scholar' };
  }

  const fallback = await fetchOpenAlexProfileByOrcid(orcid);
  if (fallback) {
    return { profile: fallback, source: 'openalex' };
  }

  if (primary) {
    return { profile: primary, source: 'semantic_scholar' };
  }

  return { profile: null, source: null };
}

const NUMERIC_FIELDS = [
  { key: 'hIndex', fieldName: 'h_index' },
  { key: 'paperCount', fieldName: 'paper_count' },
  { key: 'citationCount', fieldName: 'citation_count' },
];

/**
 * One comparison row per field the user actually submitted a claim for —
 * fields left blank are never compared (nothing to verify against). Numeric
 * fields require an EXACT match to be marked `match: true`; "close enough"
 * is never treated as verified (per the verification-criteria requirement).
 *
 * journal_impact_factor is a special case: neither Semantic Scholar nor
 * OpenAlex exposes it at all, so instead of silently dropping it or
 * guessing, it's always recorded with match:false and a clear note — and
 * flagged with `unverifiableField: true` (an in-memory-only marker, not a DB
 * column) so it doesn't count toward the overall verification status the
 * way a genuine numeric/identity discrepancy would.
 */
function buildComparisons(submitted, verified) {
  const comparisons = [];

  for (const { key, fieldName } of NUMERIC_FIELDS) {
    const submittedValue = submitted[key];
    if (submittedValue === undefined || submittedValue === null || submittedValue === '') continue;
    const verifiedValue = verified[key];
    comparisons.push({
      fieldName,
      submittedValue: String(submittedValue),
      verifiedValue: String(verifiedValue),
      difference: Number(verifiedValue) - Number(submittedValue),
      match: Number(submittedValue) === Number(verifiedValue),
    });
  }

  if (submitted.name) {
    const match = submitted.name.trim().toLowerCase() === (verified.name || '').trim().toLowerCase();
    comparisons.push({
      fieldName: 'name',
      submittedValue: submitted.name,
      verifiedValue: verified.name,
      difference: null,
      match,
    });
  }

  if (submitted.affiliation) {
    const submittedLower = submitted.affiliation.trim().toLowerCase();
    const verifiedAffiliations = (verified.affiliations || []).map((a) => a.toLowerCase());
    // Substring match both directions — "MIT" should match "Massachusetts
    // Institute of Technology" and vice versa, without requiring the user to
    // type the institution's name exactly as OpenAlex/Semantic Scholar do.
    const match = verifiedAffiliations.some((a) => a.includes(submittedLower) || submittedLower.includes(a));
    comparisons.push({
      fieldName: 'affiliation',
      submittedValue: submitted.affiliation,
      verifiedValue: (verified.affiliations || []).join('; ') || null,
      difference: null,
      match,
    });
  }

  if (submitted.journalImpactFactor !== undefined && submitted.journalImpactFactor !== null && submitted.journalImpactFactor !== '') {
    comparisons.push({
      fieldName: 'journal_impact_factor',
      submittedValue: String(submitted.journalImpactFactor),
      verifiedValue: 'Not available from OpenAlex/Semantic Scholar. Unverifiable with current sources',
      difference: null,
      match: false,
      unverifiableField: true,
    });
  }

  return comparisons;
}

/**
 * Full pipeline: validate ORCID -> resolve profile (Semantic Scholar
 * primary, OpenAlex fallback) -> compare against whatever the user claims.
 * Returns everything the caller needs to persist + display, but does NOT
 * persist anything itself.
 *
 * verificationStatus:
 *   'unverifiable' — malformed ORCID, or neither source has any record for it
 *   'verified'     — profile found and every submitted field (if any) matched
 *   'partial'      — profile found but at least one submitted field (other
 *                     than journal_impact_factor, which never counts) didn't match
 */
async function verifyAuthorByOrcid(orcidInput, submitted = {}) {
  const orcid = normalizeOrcid(orcidInput);
  if (!orcid) {
    return {
      orcid: null,
      verificationStatus: 'unverifiable',
      reason: 'invalid_orcid',
      source: null,
      verified: null,
      papers: [],
      comparisons: [],
    };
  }

  const { profile, source } = await resolveAuthorProfile(orcid);

  if (!profile) {
    return {
      orcid,
      verificationStatus: 'unverifiable',
      reason: 'not_found',
      source: null,
      verified: null,
      papers: [],
      comparisons: [],
    };
  }

  const verified = {
    name: profile.name,
    affiliations: profile.affiliations || [],
    hIndex: profile.hIndex,
    paperCount: profile.paperCount,
    citationCount: profile.totalCitations,
    // `semanticScholarId` is the field name BOTH services return the
    // resolved author id under, even for an OpenAlex profile (see
    // openAlex.js's "field name kept for wire compatibility" comment) — so
    // which app-level id this becomes depends on which source actually won.
    openAlexAuthorId: source === 'openalex' ? profile.semanticScholarId : null,
    semanticScholarAuthorId: source === 'semantic_scholar' ? profile.semanticScholarId : null,
  };

  const comparisons = buildComparisons(submitted, verified);
  const hasMismatch = comparisons.some((c) => !c.unverifiableField && !c.match);

  return {
    orcid,
    verificationStatus: hasMismatch ? 'partial' : 'verified',
    reason: null,
    source,
    verified,
    papers: profile.papers.map((p) => ({
      externalId: p.externalId || null,
      doi: p.doi || null,
      title: p.title,
      year: p.year || null,
      venue: p.venue || null,
      citations: p.citations || 0,
    })),
    comparisons,
  };
}

module.exports = { normalizeOrcid, resolveAuthorProfile, buildComparisons, verifyAuthorByOrcid };
