const store = require('../services/store');
const { projectHIndex } = require('../utils/prediction');
const { getMultiplier } = require('../utils/venueTiers');
const { sendError } = require('../utils/sendError');

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
    // Each paper's actual publish year, in the same order — switches
    // projectHIndex into its age-aware "real" citation-lifecycle model
    // instead of a flat monthly rate applied uniformly. See
    // utils/prediction.js's ageGrowthMultiplier for the rationale.
    const currentPaperYears = papers.map((p) => p.year || null);

    const projection = projectHIndex({
      currentCitations,
      currentPaperYears,
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
    return sendError(res, err);
  }
}

module.exports = { createPrediction };
