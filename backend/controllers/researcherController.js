const store = require('../services/store');
const { fetchAuthorProfile } = require('../services/semanticScholar');
const { generateActionItems } = require('../utils/actionItems');

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

module.exports = { addResearcher, getResearcher, listPapers, getActionItems };
