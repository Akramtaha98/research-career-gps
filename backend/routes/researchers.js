const express = require('express');
const {
  searchResearchers,
  addResearcher,
  getMyLatestResearcher,
  getResearcher,
  listPapers,
  setPaperVerification,
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

// Public — name search doesn't touch user data or require an account.
router.get('/search', searchResearchers);

router.use(requireAuth);

router.post('/', addResearcher);
// Must be registered before '/:id' — otherwise Express would match "me" as an :id param.
router.get('/me/latest', getMyLatestResearcher);
router.get('/:id', getResearcher);
router.get('/:id/papers', listPapers);
router.patch('/:id/paper-verification', setPaperVerification);
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
