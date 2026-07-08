const axios = require('axios');
const { calculateHIndex } = require('../utils/hIndex');

const BASE_URL = 'https://api.semanticscholar.org/graph/v1';

const client = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
  headers: process.env.SEMANTIC_SCHOLAR_API_KEY
    ? { 'x-api-key': process.env.SEMANTIC_SCHOLAR_API_KEY }
    : {},
});

/**
 * Fetch an author + their papers from Semantic Scholar, and recompute the
 * H-index ourselves (rather than trusting their cached `hIndex` field) so
 * the number always matches our own citation snapshot.
 *
 * Semantic Scholar's public rate limit is ~100 requests / 5 minutes without
 * an API key. On 429 we retry once with backoff before giving up.
 */
async function fetchAuthorProfile(semanticScholarId, { retry = true } = {}) {
  const fields = [
    'name',
    'hIndex',
    'citationCount',
    'paperCount',
    'papers.title',
    'papers.year',
    'papers.citationCount',
    'papers.venue',
    'papers.externalIds',
  ].join(',');

  try {
    const { data } = await client.get(`/author/${encodeURIComponent(semanticScholarId)}`, {
      params: { fields },
    });

    const papers = (data.papers || []).map((p) => ({
      externalId: p.paperId || (p.externalIds && p.externalIds.DOI) || null,
      title: p.title || 'Untitled',
      year: p.year || null,
      citations: p.citationCount || 0,
      venue: p.venue || null,
    }));

    const citations = papers.map((p) => p.citations);
    const hIndex = calculateHIndex(citations);
    const totalCitations = citations.reduce((a, b) => a + b, 0);

    return {
      semanticScholarId,
      source: 'semantic_scholar',
      name: data.name || 'Unknown',
      hIndex,
      totalCitations,
      paperCount: papers.length,
      papers,
    };
  } catch (err) {
    if (err.response && err.response.status === 429 && retry) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      return fetchAuthorProfile(semanticScholarId, { retry: false });
    }
    if (err.response && err.response.status === 404) {
      const notFound = new Error(`No Semantic Scholar author found for id "${semanticScholarId}"`);
      notFound.statusCode = 404;
      throw notFound;
    }
    if (err.response && err.response.status === 429) {
      const rateLimited = new Error('Semantic Scholar rate limit exceeded. Try again shortly.');
      rateLimited.statusCode = 429;
      throw rateLimited;
    }
    const wrapped = new Error(`Semantic Scholar request failed: ${err.message}`);
    wrapped.statusCode = err.response ? err.response.status : 502;
    throw wrapped;
  }
}

/**
 * Search Semantic Scholar for authors matching a name, so users can find
 * researchers without needing to already know their numeric Author ID.
 * Returns lightweight candidates for a disambiguation UI — full paper data
 * is fetched separately via fetchAuthorProfile once the user picks one.
 */
async function searchAuthors(query, { retry = true } = {}) {
  // NOTE: 'aliases' looks like it should exist on this endpoint (and is
  // documented in some older references) but Semantic Scholar's live API
  // actually rejects it with a 400 "Unrecognized or unsupported fields"
  // error — confirmed directly against their API. Do not add it back
  // without testing; it will break search entirely, not degrade gracefully.
  const fields = ['name', 'affiliations', 'homepage', 'externalIds', 'paperCount', 'citationCount', 'hIndex'].join(
    ','
  );

  try {
    const { data } = await client.get('/author/search', {
      params: { query, fields },
    });

    return (data.data || []).map((a) => ({
      semanticScholarId: a.authorId,
      source: 'semantic_scholar',
      name: a.name || 'Unknown',
      affiliations: a.affiliations || [],
      homepage: a.homepage || null,
      orcid: a.externalIds?.ORCID || null,
      paperCount: a.paperCount || 0,
      citationCount: a.citationCount || 0,
      hIndex: a.hIndex || 0,
    }));
  } catch (err) {
    if (err.response && err.response.status === 429 && retry) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      return searchAuthors(query, { retry: false });
    }
    const wrapped = new Error(`Semantic Scholar search failed: ${err.message}`);
    wrapped.statusCode = err.response ? err.response.status : 502;
    throw wrapped;
  }
}

/**
 * Collaboration advisor: finds the researcher's most frequent co-authors and
 * ranks them by h-index, so the app can suggest "these are your strongest
 * existing collaborators — consider more joint work with them" rather than
 * inventing connections that don't exist. Two Semantic Scholar calls: one for
 * the author's papers + co-authors, one batched call for the co-authors'
 * stats (paperCount/citationCount/hIndex).
 */
async function fetchTopCollaborators(semanticScholarId, { limit = 5 } = {}) {
  const { data } = await client.get(`/author/${encodeURIComponent(semanticScholarId)}`, {
    params: { fields: 'papers.authors' },
  });

  const frequency = new Map(); // coAuthorId -> { name, count }
  for (const paper of data.papers || []) {
    for (const author of paper.authors || []) {
      if (!author.authorId || author.authorId === semanticScholarId) continue;
      const existing = frequency.get(author.authorId);
      if (existing) {
        existing.count += 1;
      } else {
        frequency.set(author.authorId, { name: author.name, count: 1 });
      }
    }
  }

  if (frequency.size === 0) return [];

  // Only look up stats for the most frequent co-authors to keep this to one
  // batch request regardless of how many total co-authors there are.
  const candidateIds = [...frequency.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 15)
    .map(([id]) => id);

  const { data: stats } = await client.post(
    '/author/batch',
    { ids: candidateIds },
    { params: { fields: 'name,paperCount,citationCount,hIndex' } }
  );

  return stats
    .filter(Boolean)
    .map((s) => ({
      semanticScholarId: s.authorId,
      name: s.name,
      paperCount: s.paperCount || 0,
      citationCount: s.citationCount || 0,
      hIndex: s.hIndex || 0,
      papersCoAuthored: frequency.get(s.authorId)?.count || 0,
    }))
    .sort((a, b) => b.hIndex - a.hIndex)
    .slice(0, limit);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fetches every citing paper's publication year for one paper, so callers
 * can reconstruct "how many citations did this paper actually have by year
 * Y" instead of only knowing today's total. Paginated (Semantic Scholar caps
 * this endpoint at 1000/page) and retries once on 429 with backoff, same
 * pattern as fetchAuthorProfile/searchAuthors above.
 *
 * @param {string} paperId - Semantic Scholar paper ID (not a DOI)
 * @returns {Promise<number[]>} publication years of papers citing this one
 */
async function fetchPaperCitationYears(paperId, { retry = true } = {}) {
  const years = [];
  let offset = 0;
  const limit = 1000;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const { data } = await client.get(`/paper/${encodeURIComponent(paperId)}/citations`, {
        params: { fields: 'year', offset, limit },
      });
      const batch = data.data || [];
      for (const item of batch) {
        if (item.citingPaper && typeof item.citingPaper.year === 'number') {
          years.push(item.citingPaper.year);
        }
      }
      if (!data.next || batch.length < limit) break;
      offset = data.next;
    } catch (err) {
      if (err.response && err.response.status === 429 && retry) {
        await sleep(2000);
        return fetchPaperCitationYears(paperId, { retry: false });
      }
      // A single paper's citation list failing (404, timeout, etc.) shouldn't
      // abort the whole historical computation — treat it as "no data" for
      // this paper and let the caller fall back to its known total.
      return [];
    }
  }

  return years;
}

module.exports = { fetchAuthorProfile, searchAuthors, fetchTopCollaborators, fetchPaperCitationYears };
