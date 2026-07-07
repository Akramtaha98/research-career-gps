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
  const fields = ['name', 'affiliations', 'paperCount', 'citationCount', 'hIndex'].join(',');

  try {
    const { data } = await client.get('/author/search', {
      params: { query, fields },
    });

    return (data.data || []).map((a) => ({
      semanticScholarId: a.authorId,
      name: a.name || 'Unknown',
      affiliations: a.affiliations || [],
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

module.exports = { fetchAuthorProfile, searchAuthors };
