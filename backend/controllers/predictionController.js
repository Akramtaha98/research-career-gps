const store = require('../services/store');
const { projectHIndex } = require('../utils/prediction');
const { getMultiplier } = require('../utils/venueTiers');

/**
 * POST /api/predictions
 * Body: { researcherId, targetH, monthlyCitationRate, papersPerYear, venueTier? }
 * `venueTier` is optional — one of 'top' | 'strong' | 'average' | 'emerging'
 * (see utils/venueTiers.js). Defaults to 'average' (multiplier 1x).
 */
async function createPrediction(req, res) {
  try {
    const { researcherId, targetH, monthlyCitationRate, papersPerYear, venueTier } = req.body;

    if (!researcherId || targetH == null || monthlyCitationRate == null || papersPerYear == null) {
      return res.status(400).json({
        error: 'researcherId, targetH, monthlyCitationRate, and papersPerYear are required',
      });
    }

    const researcher = await store.findResearcherById(researcherId);
    if (!researcher) return res.status(404).json({ error: 'Researcher not found' });
    if (researcher.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized for this researcher' });
    }

    const papers = await store.listPapers(researcherId);
    const currentCitations = papers.map((p) => p.citations || 0);

    const projection = projectHIndex({
      currentCitations,
      targetH: Number(targetH),
      monthlyCitationRate: Number(monthlyCitationRate),
      papersPerYear: Number(papersPerYear),
      newPaperCitationMultiplier: getMultiplier(venueTier || 'average'),
    });

    const saved = await store.createPrediction({
      researcherId,
      targetH: Number(targetH),
      monthlyCitations: Number(monthlyCitationRate),
      papersPerYear: Number(papersPerYear),
      estimatedMonths: projection.estimatedMonths,
    });

    return res.status(201).json({ prediction: saved, projection });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

module.exports = { createPrediction };
