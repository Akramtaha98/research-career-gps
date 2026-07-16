const store = require('../services/store');
const verificationService = require('../services/verificationService');
const { sendError } = require('../utils/sendError');

const NUMERIC_FIELDS = ['hIndex', 'paperCount', 'citationCount'];

/**
 * POST /api/verify
 * Body: { orcid, name?, affiliation?, hIndex?, paperCount?, citationCount?, journalImpactFactor? }
 * Runs the full verify-against-Semantic-Scholar/OpenAlex pipeline and, when
 * a profile was actually found, persists the run (see store.js
 * saveVerificationRun). An "unverifiable" result (bad ORCID, or no record in
 * either source) is returned but NOT persisted — nothing to attach it to.
 */
async function runVerification(req, res) {
  try {
    const { orcid, name, affiliation, journalImpactFactor } = req.body || {};

    if (!orcid || typeof orcid !== 'string') {
      return res.status(400).json({ error: 'orcid is required' });
    }

    const submitted = {};
    if (typeof name === 'string' && name.trim()) submitted.name = name.trim();
    if (typeof affiliation === 'string' && affiliation.trim()) submitted.affiliation = affiliation.trim();
    if (journalImpactFactor !== undefined && journalImpactFactor !== null && journalImpactFactor !== '') {
      submitted.journalImpactFactor = journalImpactFactor;
    }

    for (const key of NUMERIC_FIELDS) {
      const raw = req.body[key];
      if (raw === undefined || raw === null || raw === '') continue;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) {
        return res.status(400).json({ error: `${key} must be a non-negative number` });
      }
      submitted[key] = n;
    }

    const result = await verificationService.verifyAuthorByOrcid(orcid, submitted);

    if (result.verificationStatus === 'unverifiable') {
      return res.json({
        orcid: result.orcid,
        verificationStatus: result.verificationStatus,
        reason: result.reason,
        source: null,
        author: null,
        metrics: null,
        papers: [],
        comparisons: [],
        isOwner: false,
      });
    }

    // ORCID-OWNER OVERRIDE: same check already used for the Dashboard's
    // shared Scopus/WOS pool (see submitSharedScore in researcherController.js)
    // — if the signed-in user authenticated via ORCID and their account's
    // ORCID matches the one just verified, their submitted numbers are
    // trusted as the actual owner's correction, not just another claim to
    // check against Semantic Scholar/OpenAlex. See store.saveVerificationRun.
    const submitter = await store.findUserById(req.user.id);
    const isOwner = Boolean(submitter?.orcid) && submitter.orcid === result.orcid;

    const saved = await store.saveVerificationRun({
      orcid: result.orcid,
      submittedName: submitted.name || null,
      verifiedName: result.verified.name,
      submittedAffiliation: submitted.affiliation || null,
      verifiedAffiliation: (result.verified.affiliations || []).join('; ') || null,
      openAlexAuthorId: result.verified.openAlexAuthorId,
      semanticScholarAuthorId: result.verified.semanticScholarAuthorId,
      source: result.source,
      verificationStatus: result.verificationStatus,
      submittedHIndex: submitted.hIndex ?? null,
      verifiedHIndex: result.verified.hIndex,
      submittedPaperCount: submitted.paperCount ?? null,
      verifiedPaperCount: result.verified.paperCount,
      submittedCitationCount: submitted.citationCount ?? null,
      verifiedCitationCount: result.verified.citationCount,
      papers: result.papers,
      comparisons: result.comparisons,
      submittedByUserId: req.user.id,
      isOwner,
    });

    return res.json({
      orcid: result.orcid,
      verificationStatus: result.verificationStatus,
      reason: null,
      source: result.source,
      author: saved.author,
      metrics: saved.metrics,
      papers: saved.papers,
      comparisons: saved.comparisons,
      isOwner,
    });
  } catch (err) {
    return sendError(res, err);
  }
}

/** GET /api/verify/:orcid — latest saved verification snapshot for this ORCID, if any. */
async function getVerification(req, res) {
  try {
    const normalized = verificationService.normalizeOrcid(req.params.orcid);
    if (!normalized) return res.status(400).json({ error: 'Invalid ORCID format' });

    const record = await store.getVerificationByOrcid(normalized);
    if (!record) return res.json({ author: null, metrics: null, papers: [], comparisons: [] });
    return res.json(record);
  } catch (err) {
    return sendError(res, err);
  }
}

/** GET /api/verify/:orcid/history — every past verification run for this ORCID, newest first. */
async function getVerificationHistory(req, res) {
  try {
    const normalized = verificationService.normalizeOrcid(req.params.orcid);
    if (!normalized) return res.status(400).json({ error: 'Invalid ORCID format' });

    const history = await store.getVerificationHistory(normalized);
    return res.json({ history });
  } catch (err) {
    return sendError(res, err);
  }
}

module.exports = { runVerification, getVerification, getVerificationHistory };
