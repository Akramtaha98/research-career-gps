const express = require('express');
const rateLimit = require('express-rate-limit');
const {
  searchResearchers,
  addResearcher,
  getMyLatestResearcher,
  getResearcher,
  listPapers,
  setPaperVerification,
  addPaperByDoi,
  removeManualPaper,
  getTimeline,
  getActionItems,
  getCollaborators,
  getRealHistory,
  setScopusScore,
  clearScopusScore,
  setWosScore,
  clearWosScore,
  getSharedScores,
  submitSharedScopusScore,
  submitSharedWosScore,
} = require('../controllers/researcherController');
const { requireAuth } = require('../middleware/auth');
const { requirePro } = require('../middleware/requirePro');

const router = express.Router();

// Public, unauthenticated, and proxies straight through to Semantic
// Scholar/OpenAlex (see researcherSource.js) -- without its own limit this
// endpoint is the easiest thing in the whole API to hammer or scrape, and
// doing so would also burn through this app's own upstream API quota for
// every real user. Looser than authLimiter since normal search-as-you-type
// usage legitimately fires several requests per minute.
const searchLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.DISABLE_RATE_LIMIT === 'true',
});

// Public — name search doesn't touch user data or require an account.
router.get('/search', searchLimiter, searchResearchers);

router.use(requireAuth);

router.post('/', addResearcher);
// Must be registered before '/:id' — otherwise Express would match "me" as an :id param.
router.get('/me/latest', getMyLatestResearcher);
router.get('/:id', getResearcher);
router.get('/:id/papers', listPapers);
router.patch('/:id/paper-verification', setPaperVerification);
router.post('/:id/papers/doi', addPaperByDoi);
router.delete('/:id/papers/manual', removeManualPaper);
router.get('/:id/timeline', getTimeline);
router.get('/:id/actions', getActionItems);
router.get('/:id/collaborators', requirePro, getCollaborators);
router.get('/:id/real-history', getRealHistory);
router.patch('/:id/scopus-score', setScopusScore);
router.delete('/:id/scopus-score', clearScopusScore);
router.patch('/:id/wos-score', setWosScore);
router.delete('/:id/wos-score', clearWosScore);
router.get('/:id/shared-scores', getSharedScores);
router.post('/:id/shared-scores/scopus', submitSharedScopusScore);
router.post('/:id/shared-scores/wos', submitSharedWosScore);

module.exports = router;
