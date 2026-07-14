const axios = require('axios');

// Crossref's public Works API — free, no API key, no rate-limit tier gating
// (unlike Scopus/WOS). Used for the "add a missing paper by DOI" feature:
// OpenAlex/Semantic Scholar sometimes take weeks to index a brand-new paper,
// so a researcher who just published can't wait for auto-sync to catch up.
// Crossref is the DOI registration agency itself, so a DOI that resolves
// there is about as authoritative a source as exists for "this paper is
// real and this is its metadata" — see docs.crossref.org/docs/rest-api.
//
// Crossref asks API users to identify themselves via a `mailto` param (or in
// the User-Agent) in exchange for the faster "polite pool", same convention
// already used for OpenAlex — see OPENALEX_MAILTO.
const MAILTO = process.env.OPENALEX_MAILTO || undefined;

const client = axios.create({
  baseURL: 'https://api.crossref.org',
  timeout: 10000,
  headers: {
    'User-Agent': `ResearchGPS/1.0 (https://github.com/Akramtaha98/research-career-gps${
      MAILTO ? `; mailto:${MAILTO}` : ''
    })`,
  },
});

// Standard DOI syntax: a "10." prefix, a 4+ digit registrant code, a slash,
// then a registrant-defined suffix (any non-whitespace). Accepts a bare DOI
// or a full https://doi.org/... URL, since that's what people tend to paste.
const DOI_RE = /^(?:https?:\/\/(?:dx\.)?doi\.org\/)?(10\.\d{4,9}\/\S+)$/i;

function normalizeDoi(input) {
  const match = String(input || '').trim().match(DOI_RE);
  return match ? match[1] : null;
}

/**
 * Looks up one work by DOI. Returns null (not a thrown error) for a 404 —
 * "this DOI doesn't exist / isn't registered" is an expected, normal result
 * here, not a failure of the lookup itself. Throws for anything else
 * (network error, malformed DOI caught earlier, Crossref outage), letting
 * the caller decide how to report that.
 *
 * @returns {{doi, title, year, venue, citations, authors: string[]} | null}
 */
async function fetchWorkByDoi(rawDoi) {
  const doi = normalizeDoi(rawDoi);
  if (!doi) {
    const err = new Error('That doesn\'t look like a valid DOI (expected format: 10.xxxx/yyyy).');
    err.statusCode = 400;
    throw err;
  }

  let data;
  try {
    const res = await client.get(`/works/${encodeURIComponent(doi)}`, { params: { mailto: MAILTO } });
    data = res.data?.message;
  } catch (err) {
    if (err.response && err.response.status === 404) return null;
    const wrapped = new Error('Could not reach Crossref to verify that DOI right now. Try again shortly.');
    wrapped.statusCode = 502;
    throw wrapped;
  }
  if (!data) return null;

  const title = Array.isArray(data.title) ? data.title[0] : data.title;
  const year =
    data['published-print']?.['date-parts']?.[0]?.[0] ||
    data['published-online']?.['date-parts']?.[0]?.[0] ||
    data.issued?.['date-parts']?.[0]?.[0] ||
    null;
  const venue = Array.isArray(data['container-title']) ? data['container-title'][0] : data['container-title'];
  const authors = Array.isArray(data.author)
    ? data.author.map((a) => [a.given, a.family].filter(Boolean).join(' ')).filter(Boolean)
    : [];

  return {
    doi,
    title: title || '(untitled)',
    year: year || null,
    venue: venue || null,
    // Crossref's own citation count — a real, independently-tracked number,
    // but built from a different (generally smaller) index than Semantic
    // Scholar/OpenAlex. Labeled "via Crossref" in the UI so it's never
    // confused with those.
    citations: typeof data['is-referenced-by-count'] === 'number' ? data['is-referenced-by-count'] : 0,
    authors,
  };
}

module.exports = { fetchWorkByDoi, normalizeDoi };
