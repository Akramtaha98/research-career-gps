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
 * Parses an optional non-negative integer field (paperCount/citations on the
 * Scopus/WOS forms) — unlike hIndex these are optional, so undefined/null/''
 * are all valid "not provided" and pass through as null. Returns
 * { ok: false } with a message if a value WAS provided but isn't a valid
 * non-negative integer.
 */
function parseOptionalNonNegativeInt(value, fieldName) {
  if (value === undefined || value === null || value === '') return { ok: true, value: null };
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return { ok: false, message: `${fieldName} must be a whole number, 0 or higher.` };
  }
  return { ok: true, value: parsed };
}

/**
 * Mathematical sanity check shared by the private (scopus-score/wos-score)
 * and community (shared-scores) submit endpoints: by definition an H-index
 * can never exceed the researcher's total paper count (h papers each with
 * >= h citations requires at least h papers to exist). Catches obvious typos
 * or made-up numbers before they're stored, independent of the ORCID-owner
 * verification check (which only establishes WHO is submitting, not whether
 * the numbers are internally consistent).
 */
function validateHIndexAgainstPaperCount(hIndex, paperCount) {
  if (paperCount != null && hIndex > paperCount) {
    return {
      ok: false,
      message: `hIndex (${hIndex}) cannot be greater than paperCount (${paperCount}) — an H-index can never exceed the total number of papers.`,
    };
  }
  return { ok: true };
}

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

    // Attach any crowdsourced Scopus/WOS values already on file for each
    // candidate that has an ORCID, so users can see community-reported
    // numbers right in the search results — before deciding which
    // candidate to track. Best-effort: a lookup failure for one candidate
    // shouldn't break search results for the rest.
    await Promise.all(
      candidates.map(async (c) => {
        if (!c.orcid) return;
        try {
          c.sharedScores = await store.getSharedScores(c.orcid);
        } catch {
          c.sharedScores = null;
        }
      })
    );

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
      orcid: profile.orcid || null,
    });

    await store.replacePapers(researcher.id, profile.papers);

    return res.status(201).json({ researcher });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
}

/**
 * GET /api/researchers/me/latest
 * Returns the logged-in user's most recently updated tracked researcher (or
 * { researcher: null } if they've never added one). Used by the frontend to
 * restore the last-tracked researcher on login instead of leaving the demo
 * example on screen — see ResearcherContext.jsx's loadLatestResearcher.
 */
async function getMyLatestResearcher(req, res) {
  try {
    const researcher = await store.findLatestResearcherByUser(req.user.id);
    if (!researcher) return res.json({ researcher: null });
    const history = await store.getHistory(researcher.id);
    return res.json({ researcher, history });
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
        orcid: profile.orcid || null,
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

      const { profileUrl, hIndex, paperCount, citations } = req.body;
      const parsedH = Number(hIndex);
      if (!Number.isInteger(parsedH) || parsedH < 0 || parsedH > 1000) {
        return res.status(400).json({ error: 'hIndex must be a whole number between 0 and 1000' });
      }
      if (profileUrl && !/^https?:\/\//i.test(profileUrl)) {
        return res.status(400).json({ error: 'profileUrl must start with http:// or https://' });
      }
      const parsedPaperCount = parseOptionalNonNegativeInt(paperCount, 'paperCount');
      if (!parsedPaperCount.ok) return res.status(400).json({ error: parsedPaperCount.message });
      const parsedCitations = parseOptionalNonNegativeInt(citations, 'citations');
      if (!parsedCitations.ok) return res.status(400).json({ error: parsedCitations.message });
      const hVsPapers = validateHIndexAgainstPaperCount(parsedH, parsedPaperCount.value);
      if (!hVsPapers.ok) return res.status(400).json({ error: hVsPapers.message });

      const updated = await store.setScore(id, which, {
        profileUrl: profileUrl || null,
        hIndex: parsedH,
        paperCount: parsedPaperCount.value,
        citations: parsedCitations.value,
      });
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

/**
 * GET /api/researchers/:id/shared-scores
 * Public within auth (any logged-in user, not just the one who added this
 * researcher) — returns the CROWDSOURCED Scopus/WOS values for the person
 * this researcher record points to (matched via their ORCID, see
 * schema.sql's shared_scores comment). Distinct from the researcher's own
 * private scopus_h_index/wos_h_index fields (self-reported baseline used for
 * that user's own Predictor projections) — this is the shared, cross-user
 * pool. Returns nulls (not an error) when the researcher has no ORCID on
 * file, since crowdsourcing has no reliable key to group submissions on
 * without one.
 */
async function getSharedScores(req, res) {
  try {
    const { id } = req.params;
    const researcher = await store.findResearcherById(id);
    if (!researcher) return res.status(404).json({ error: 'Researcher not found' });
    if (researcher.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to view this researcher' });
    }
    if (!researcher.orcid) {
      return res.json({ orcid: null, scopus: null, wos: null });
    }
    const shared = await store.getSharedScores(researcher.orcid);
    return res.json({ orcid: researcher.orcid, ...shared });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
}

/**
 * POST /api/researchers/:id/shared-scores/:which  ('scopus' | 'wos')
 * Body: { profileUrl, hIndex }
 * Submits a value to the CROWDSOURCED pool for this researcher's ORCID.
 * Verification model: if the submitting user's own ORCID-authenticated
 * account (users.orcid) matches this researcher's ORCID — i.e. they ARE the
 * researcher — the submission is immediately verified and becomes canonical.
 * Otherwise it's stored as unverified; it still becomes the displayed
 * "current" value if nothing verified exists yet, but can't silently
 * overwrite an already-verified value (see store.js's
 * resolveSharedScoreSubmission for the exact rules the user chose).
 */
function submitSharedScore(which) {
  return async function (req, res) {
    try {
      const { id } = req.params;
      const researcher = await store.findResearcherById(id);
      if (!researcher) return res.status(404).json({ error: 'Researcher not found' });
      if (researcher.user_id !== req.user.id) {
        return res.status(403).json({ error: 'Not authorized to view this researcher' });
      }
      if (!researcher.orcid) {
        return res.status(400).json({
          error: 'This researcher has no ORCID on file, so a shared/crowdsourced value cannot be tracked for them yet.',
        });
      }

      const { profileUrl, hIndex, paperCount, citations } = req.body;
      const parsedH = Number(hIndex);
      if (!Number.isInteger(parsedH) || parsedH < 0 || parsedH > 1000) {
        return res.status(400).json({ error: 'hIndex must be a whole number between 0 and 1000' });
      }
      if (profileUrl && !/^https?:\/\//i.test(profileUrl)) {
        return res.status(400).json({ error: 'profileUrl must start with http:// or https://' });
      }
      const parsedPaperCount = parseOptionalNonNegativeInt(paperCount, 'paperCount');
      if (!parsedPaperCount.ok) return res.status(400).json({ error: parsedPaperCount.message });
      const parsedCitations = parseOptionalNonNegativeInt(citations, 'citations');
      if (!parsedCitations.ok) return res.status(400).json({ error: parsedCitations.message });
      const hVsPapers = validateHIndexAgainstPaperCount(parsedH, parsedPaperCount.value);
      if (!hVsPapers.ok) return res.status(400).json({ error: hVsPapers.message });

      const submitter = await store.findUserById(req.user.id);
      const isOwner = Boolean(submitter?.orcid) && submitter.orcid === researcher.orcid;

      const result = await store.submitSharedScore({
        orcid: researcher.orcid,
        which,
        hIndex: parsedH,
        paperCount: parsedPaperCount.value,
        citations: parsedCitations.value,
        profileUrl: profileUrl || null,
        submittedByUserId: req.user.id,
        isOwner,
      });

      return res.json(result); // { current, resultStatus, applied }
    } catch (err) {
      return res.status(err.statusCode || 500).json({ error: err.message });
    }
  };
}

module.exports = {
  searchResearchers,
  addResearcher,
  getMyLatestResearcher,
  getResearcher,
  listPapers,
  getActionItems,
  getCollaborators,
  getRealHistory,
  setScopusScore: setScore('scopus'),
  clearScopusScore: clearScore('scopus'),
  setWosScore: setScore('wos'),
  clearWosScore: clearScore('wos'),
  getSharedScores,
  submitSharedScopusScore: submitSharedScore('scopus'),
  submitSharedWosScore: submitSharedScore('wos'),
};
