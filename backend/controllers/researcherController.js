const store = require('../services/store');
const { fetchAuthorProfile, searchAuthors, fetchTopCollaborators } = require('../services/semanticScholar');
const { computeHistoricalHIndex } = require('../services/historicalHIndex');
const { generateActionItems } = require('../utils/actionItems');

// Computing real historical H-index makes one Semantic Scholar request per
// paper (rate-limit-sensitive), so cache results per researcher in memory
// instead of recomputing on every dashboard visit. Cleared on server
// restart — fine for an MVP; a real deployment might move this to Redis/DB.
const realHistoryCache = new Map(); // researcherId -> { computedAt, data }
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * GET /api/researchers/search?q=name
 * Public (no auth) — lets a user find a researcher by name before deciding
 * which one to track. Returns lightweight candidates, no papers/citations
 * are stored until the user picks one via POST /api/researchers.
 */
async function searchResearchers(req, res) {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.status(400).json({ error: 'q is required' });
    if (q.length < 2) return res.status(400).json({ error: 'q must be at least 2 characters' });

    const candidates = await searchAuthors(q);
    return res.json({ candidates });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
}

/**
 * POST /api/researchers
 * Body: { semanticScholarId }
 * Fetches the author from Semantic Scholar, recalculates H-index, and
 * stores/updates the researcher + paper snapshot for the logged-in user.
 */
async function addResearcher(req, res) {
  try {
    const { semanticScholarId } = req.body;
    if (!semanticScholarId) {
      return res.status(400).json({ error: 'semanticScholarId is required' });
    }

    const profile = await fetchAuthorProfile(semanticScholarId);

    const researcher = await store.upsertResearcher({
      userId: req.user.id,
      semanticScholarId: profile.semanticScholarId,
      name: profile.name,
      hIndex: profile.hIndex,
      totalCitations: profile.totalCitations,
      paperCount: profile.paperCount,
    });

    await store.replacePapers(researcher.id, profile.papers);

    return res.status(201).json({ researcher });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
}

/**
 * GET /api/researchers/:id
 * Returns the stored researcher snapshot. Pass ?refresh=true to re-fetch
 * from Semantic Scholar and recalculate before returning.
 */
async function getResearcher(req, res) {
  try {
    const { id } = req.params;
    let researcher = await store.findResearcherById(id);
    if (!researcher) return res.status(404).json({ error: 'Researcher not found' });
    if (researcher.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to view this researcher' });
    }

    if (req.query.refresh === 'true') {
      const profile = await fetchAuthorProfile(researcher.semantic_scholar_id);
      researcher = await store.upsertResearcher({
        userId: req.user.id,
        semanticScholarId: profile.semanticScholarId,
        name: profile.name,
        hIndex: profile.hIndex,
        totalCitations: profile.totalCitations,
        paperCount: profile.paperCount,
      });
      await store.replacePapers(researcher.id, profile.papers);
    }

    const history = await store.getHistory(researcher.id);
    return res.json({ researcher, history });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
}

/** GET /api/researchers/:id/papers */
async function listPapers(req, res) {
  try {
    const { id } = req.params;
    const researcher = await store.findResearcherById(id);
    if (!researcher) return res.status(404).json({ error: 'Researcher not found' });
    if (researcher.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to view this researcher' });
    }
    const papers = await store.listPapers(id);
    return res.json({ papers });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

/** GET /api/researchers/:id/actions — auto-generated recommendations */
async function getActionItems(req, res) {
  try {
    const { id } = req.params;
    const researcher = await store.findResearcherById(id);
    if (!researcher) return res.status(404).json({ error: 'Researcher not found' });
    if (researcher.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to view this researcher' });
    }
    const papers = await store.listPapers(id);
    const items = generateActionItems({ papers });
    return res.json({ actionItems: items });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

/**
 * GET /api/researchers/:id/collaborators
 * Pro-gated (see middleware/requirePro.js once wired into routes). Ranks
 * the researcher's existing co-authors by h-index as collaboration
 * suggestions — grounded in real Semantic Scholar data, not invented.
 */
async function getCollaborators(req, res) {
  try {
    const { id } = req.params;
    const researcher = await store.findResearcherById(id);
    if (!researcher) return res.status(404).json({ error: 'Researcher not found' });
    if (researcher.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to view this researcher' });
    }
    const collaborators = await fetchTopCollaborators(researcher.semantic_scholar_id);
    return res.json({ collaborators });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
}

/**
 * GET /api/researchers/:id/real-history
 * Reconstructs the researcher's actual H-index for every year from their
 * earliest tracked paper to today, using real Semantic Scholar citation
 * data (not estimated/interpolated). This is slower than the app's normal
 * snapshot history (one extra Semantic Scholar request per paper, spaced
 * out to respect rate limits) so it's an explicit opt-in action, cached for
 * a few hours per researcher.
 */
async function getRealHistory(req, res) {
  try {
    const { id } = req.params;
    const researcher = await store.findResearcherById(id);
    if (!researcher) return res.status(404).json({ error: 'Researcher not found' });
    if (researcher.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to view this researcher' });
    }

    const cached = realHistoryCache.get(id);
    if (cached && Date.now() - cached.computedAt < CACHE_TTL_MS) {
      return res.json({ ...cached.data, cached: true });
    }

    const papers = await store.listPapers(id);
    const result = await computeHistoricalHIndex(
      papers.map((p) => ({ externalId: p.external_id, year: p.year, citations: p.citations }))
    );

    realHistoryCache.set(id, { computedAt: Date.now(), data: result });
    return res.json({ ...result, cached: false });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
}

module.exports = {
  searchResearchers,
  addResearcher,
  getResearcher,
  listPapers,
  getActionItems,
  getCollaborators,
  getRealHistory,
};
