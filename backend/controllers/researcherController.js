const store = require('../services/store');
const researcherSource = require('../services/researcherSource');
const { fetchTopCollaborators } = require('../services/semanticScholar');
const openAlex = require('../services/openAlex');
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

    const candidates = await researcherSource.searchAuthors(q);
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
    const { semanticScholarId, source } = req.body;
    if (!semanticScholarId) {
      return res.status(400).json({ error: 'semanticScholarId is required' });
    }

    const profile = await researcherSource.fetchAuthorProfile(semanticScholarId, source);

    const researcher = await store.upsertResearcher({
      userId: req.user.id,
      semanticScholarId: profile.semanticScholarId,
      name: profile.name,
      hIndex: profile.hIndex,
      totalCitations: profile.totalCitations,
      paperCount: profile.paperCount,
      source: profile.source,
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
      const profile = await researcherSource.fetchAuthorProfile(researcher.semantic_scholar_id, researcher.source);
      researcher = await store.upsertResearcher({
        userId: req.user.id,
        semanticScholarId: profile.semanticScholarId,
        name: profile.name,
        hIndex: profile.hIndex,
        totalCitations: profile.totalCitations,
        paperCount: profile.paperCount,
        source: profile.source,
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
    // Collaborator suggestions walk Semantic Scholar's co-authorship graph
    // specifically — an OpenAlex author ID isn't a valid Semantic Scholar ID,
    // so this isn't available for OpenAlex-sourced profiles yet.
    if (researcher.source === 'openalex') {
      return res.json({ collaborators: [], unavailable: true });
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

    let result;
    if (researcher.source === 'openalex') {
      // OpenAlex works carry per-year citation counts directly, so this is a
      // fresh profile fetch + a local computation — no per-paper request
      // loop needed (unlike the Semantic Scholar path below). Limited to
      // roughly the last 10 years, which is all OpenAlex retains.
      const profile = await openAlex.fetchAuthorProfile(researcher.semantic_scholar_id);
      const { history } = openAlex.computeYearlyHistory(profile.papers);
      result = { history, papersConsidered: profile.papers.length, papersSkipped: 0, limitedToRecentYears: true };
    } else {
      const papers = await store.listPapers(id);
      result = await computeHistoricalHIndex(
        papers.map((p) => ({ externalId: p.external_id, year: p.year, citations: p.citations }))
      );
    }

    realHistoryCache.set(id, { computedAt: Date.now(), data: result });
    return res.json({ ...result, cached: false });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
}

/**
 * PATCH /api/researchers/:id/scopus-score
 * PATCH /api/researchers/:id/wos-score
 * Body: { profileUrl, hIndex }
 * Self-reported official Scopus/WOS H-index — see schema.sql comment on
 * scopus_h_index/wos_h_index for why this exists and isn't auto-verified.
 * Scopus and WOS are independent slots (see store.js WHICH_COLUMNS); which
 * one this touches is fixed by the route, never taken from the body.
 */
function setScore(which) {
  return async function (req, res) {
    try {
      const { id } = req.params;
      const researcher = await store.findResearcherById(id);
      if (!researcher) return res.status(404).json({ error: 'Researcher not found' });
      if (researcher.user_id !== req.user.id) {
        return res.status(403).json({ error: 'Not authorized to update this researcher' });
      }

      const { profileUrl, hIndex } = req.body;
      const parsedH = Number(hIndex);
      if (!Number.isInteger(parsedH) || parsedH < 0 || parsedH > 1000) {
        return res.status(400).json({ error: 'hIndex must be a whole number between 0 and 1000' });
      }
      if (profileUrl && !/^https?:\/\//i.test(profileUrl)) {
        return res.status(400).json({ error: 'profileUrl must start with http:// or https://' });
      }

      const updated = await store.setScore(id, which, { profileUrl: profileUrl || null, hIndex: parsedH });
      return res.json({ researcher: updated });
    } catch (err) {
      return res.status(err.statusCode || 500).json({ error: err.message });
    }
  };
}

/** DELETE /api/researchers/:id/scopus-score | wos-score — removes that self-reported number. */
function clearScore(which) {
  return async function (req, res) {
    try {
      const { id } = req.params;
      const researcher = await store.findResearcherById(id);
      if (!researcher) return res.status(404).json({ error: 'Researcher not found' });
      if (researcher.user_id !== req.user.id) {
        return res.status(403).json({ error: 'Not authorized to update this researcher' });
      }
      const updated = await store.clearScore(id, which);
      return res.json({ researcher: updated });
    } catch (err) {
      return res.status(err.statusCode || 500).json({ error: err.message });
    }
  };
}

module.exports = {
  searchResearchers,
  addResearcher,
  getResearcher,
  listPapers,
  getActionItems,
  getCollaborators,
  getRealHistory,
  setScopusScore: setScore('scopus'),
  clearScopusScore: clearScore('scopus'),
  setWosScore: setScore('wos'),
  clearWosScore: clearScore('wos'),
};
