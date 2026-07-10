const axios = require('axios');
const { calculateHIndex } = require('../utils/hIndex');

const BASE_URL = 'https://api.openalex.org';

// OpenAlex asks API users to identify themselves via a `mailto` param in
// exchange for a much higher, more reliable rate limit ("the polite pool").
// Optional — the API works without it, just with a lower/less reliable limit.
const MAILTO = process.env.OPENALEX_MAILTO || undefined;

const client = axios.create({ baseURL: BASE_URL, timeout: 10000 });

/** "https://openalex.org/A5053076221" -> "A5053076221" */
function shortId(fullId) {
  if (!fullId) return null;
  const parts = fullId.split('/');
  return parts[parts.length - 1];
}

// Matches a bare ORCID iD (16 digits, optionally dashed, last char can be X)
// with or without the "https://orcid.org/" prefix the user might paste.
const ORCID_RE = /^(?:https?:\/\/orcid\.org\/)?(\d{4}-\d{4}-\d{4}-\d{3}[\dX])$/i;

function normalizeOrcid(query) {
  const match = query.trim().match(ORCID_RE);
  return match ? match[1] : null;
}

/**
 * Search OpenAlex for authors matching a name — OR, if the query is an
 * ORCID iD, look up that exact author directly. ORCID is a globally unique
 * researcher ID, so this sidesteps all the "which John Smith?" ambiguity a
 * name search has; OpenAlex indexes ORCID natively so this needs no extra
 * API and returns exactly one result when the ORCID is registered there.
 *
 * This is the app's PRIMARY researcher-search source (see
 * researcherSource.js) — OpenAlex is free, requires no API key, and has no
 * IP-based entitlement restriction, unlike Scopus/WOS. Falls back to
 * Semantic Scholar only if this fails/errors (Semantic Scholar's author
 * search endpoint doesn't support ORCID-based lookup, only name).
 */
async function searchAuthors(query) {
  const orcid = normalizeOrcid(query);
  if (orcid) {
    try {
      const { data: author } = await client.get(`/authors/https://orcid.org/${orcid}`, {
        params: { mailto: MAILTO },
      });
      return [toCandidate(author)];
    } catch (err) {
      if (err.response && err.response.status === 404) return [];
      throw err;
    }
  }

  const { data } = await client.get('/authors', {
    params: {
      search: query,
      per_page: 10,
      select: 'id,orcid,display_name,works_count,cited_by_count,summary_stats,affiliations',
      mailto: MAILTO,
    },
  });

  return (data.results || []).map(toCandidate);
}

/**
 * Some prolific/long-career authors have dozens of historical affiliations
 * on OpenAlex — cap to the 3 most recent so results stay readable instead of
 * dumping an entire career history. Shared by toCandidate (search results)
 * and fetchAuthorProfile (full profile) below.
 */
function formatAffiliations(rawAffiliations) {
  return (rawAffiliations || [])
    .slice()
    .sort((x, y) => Math.max(...(y.years || [0])) - Math.max(...(x.years || [0])))
    .slice(0, 3)
    .map((aff) => aff.institution?.display_name)
    .filter(Boolean);
}

function toCandidate(a) {
  return {
    semanticScholarId: shortId(a.id), // field name kept for wire compatibility with existing frontend/controller code
    source: 'openalex',
    name: a.display_name || 'Unknown',
    affiliations: formatAffiliations(a.affiliations),
    homepage: null,
    orcid: a.orcid ? a.orcid.replace('https://orcid.org/', '') : null,
    paperCount: a.works_count || 0,
    citationCount: a.cited_by_count || 0,
    hIndex: a.summary_stats?.h_index || 0,
  };
}

/**
 * Fetch an author + their works from OpenAlex, and recompute the H-index
 * ourselves from the works we actually stored — same reasoning as
 * semanticScholar.js: keeps the number consistent with our own snapshot
 * rather than trusting a cached summary_stats value that may drift from it.
 *
 * Also fetches each work's `counts_by_year` (last ~10 years of per-year
 * citation counts) so computeYearlyHistory() below can reconstruct H-index
 * by year without any extra per-paper requests — a real advantage over the
 * Semantic Scholar path, which needs one citation-list request per paper.
 */
async function fetchAuthorProfile(openAlexId) {
  const id = shortId(openAlexId) || openAlexId;

  let author;
  try {
    const { data } = await client.get(`/authors/${encodeURIComponent(id)}`, {
      params: { mailto: MAILTO },
    });
    author = data;
  } catch (err) {
    if (err.response && err.response.status === 404) {
      const notFound = new Error(`No OpenAlex author found for id "${id}"`);
      notFound.statusCode = 404;
      throw notFound;
    }
    const wrapped = new Error(`OpenAlex request failed: ${err.message}`);
    wrapped.statusCode = err.response ? err.response.status : 502;
    throw wrapped;
  }

  // OpenAlex's author disambiguation isn't perfect — the same real person
  // can get split into two+ separate Author IDs when their name is spelled
  // differently across papers (e.g. "Akram Taha Zeyad" vs "Akram T. Zeyad"),
  // each only holding a subset of their actual papers. Filtering works by
  // `author.id` inherits that split. ORCID is a person-level identifier
  // stamped directly on each paper's authorship line, independent of which
  // Author entity OpenAlex clustered it into — so when this author has an
  // ORCID on file, filter works by THAT instead, which pulls in papers from
  // every name-variant/split entity that carries the same ORCID. Falls back
  // to author.id only when no ORCID is on record.
  const orcid = author.orcid ? author.orcid.replace('https://orcid.org/', '') : null;
  const worksFilter = orcid ? `author.orcid:${orcid}` : `author.id:${id}`;

  const works = [];
  let cursor = '*';
  const perPage = 200;
  const MAX_WORKS = 600; // 3 pages — generous ceiling, keeps requests bounded for very prolific authors

  while (cursor && works.length < MAX_WORKS) {
    const { data } = await client.get('/works', {
      params: {
        filter: worksFilter,
        per_page: perPage,
        cursor,
        select: 'id,doi,title,publication_year,cited_by_count,primary_location,counts_by_year',
        mailto: MAILTO,
      },
    });
    works.push(...(data.results || []));
    cursor = data.meta?.next_cursor || null;
  }

  const papers = works.map((w) => ({
    externalId: shortId(w.id),
    title: w.title || 'Untitled',
    year: w.publication_year || null,
    citations: w.cited_by_count || 0,
    venue: w.primary_location?.source?.display_name || null,
    // Normalized to bare "10.xxxx/..." (OpenAlex returns full
    // "https://doi.org/10.xxxx/..." URLs) so it matches Semantic Scholar's
    // DOI format directly when researcherSource.js merges the two sources.
    doi: w.doi ? w.doi.replace('https://doi.org/', '').toLowerCase() : null,
    countsByYear: w.counts_by_year || [], // kept for computeYearlyHistory, not persisted to the papers table
  }));

  const citations = papers.map((p) => p.citations);
  const hIndex = calculateHIndex(citations);
  const totalCitations = citations.reduce((a, b) => a + b, 0);

  return {
    semanticScholarId: id, // field name kept for wire compatibility
    source: 'openalex',
    name: author.display_name || 'Unknown',
    affiliations: formatAffiliations(author.affiliations),
    orcid, // exposed so researcherSource.js can bridge to Semantic Scholar's ORCID lookup when merging
    hIndex,
    totalCitations,
    paperCount: papers.length,
    papers,
  };
}

/**
 * Reconstructs H-index by year using each work's `counts_by_year` (OpenAlex
 * only retains roughly the last 10 years of that breakdown, so — unlike the
 * Semantic Scholar real-history path — this cannot go back further than
 * that, regardless of how old the researcher's papers are). For each year Y,
 * a paper counts once published, and its citation count as of Y is the sum
 * of its per-year counts up to and including Y. The current year uses the
 * paper's authoritative total instead, for the same reason historicalHIndex.js
 * does: guarantees agreement with the official H-index shown elsewhere.
 *
 * @param {{year:number|null, citations:number, countsByYear:{year:number,cited_by_count:number}[]}[]} papers
 */
function computeYearlyHistory(papers) {
  const currentYear = new Date().getFullYear();
  const eligible = papers.filter((p) => p.year);
  if (eligible.length === 0) return { history: [], earliestAvailableYear: null };

  const allYearsWithData = eligible.flatMap((p) => (p.countsByYear || []).map((c) => c.year));
  const earliestAvailableYear = allYearsWithData.length
    ? Math.max(Math.min(...allYearsWithData), currentYear - 9)
    : currentYear - 9;

  const history = [];
  for (let year = Math.max(earliestAvailableYear, Math.min(...eligible.map((p) => p.year))); year <= currentYear; year += 1) {
    const counts = eligible
      .filter((p) => p.year <= year)
      .map((p) => {
        if (year === currentYear) return p.citations;
        return (p.countsByYear || [])
          .filter((c) => c.year <= year)
          .reduce((sum, c) => sum + (c.cited_by_count || 0), 0);
      });
    if (counts.length === 0) continue;
    history.push({ year, hIndex: calculateHIndex(counts) });
  }

  return { history, earliestAvailableYear };
}

module.exports = { searchAuthors, fetchAuthorProfile, computeYearlyHistory, shortId };
