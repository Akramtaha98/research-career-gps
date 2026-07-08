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

/**
 * @param {string} id - the ID as returned by searchAuthors (OpenAlex short ID
 *   or Semantic Scholar numeric author ID)
 * @param {string} [source] - 'openalex' | 'semantic_scholar'. Defaults to
 *   'semantic_scholar' for backward compatibility with the direct-numeric-ID
 *   search path, which predates this multi-source setup.
 */
async function fetchAuthorProfile(id, source = 'semantic_scholar') {
  if (source === 'openalex') return openAlex.fetchAuthorProfile(id);
  return semanticScholar.fetchAuthorProfile(id);
}

module.exports = { searchAuthors, fetchAuthorProfile };
