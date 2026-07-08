const express = require('express');
const {
  searchResearchers,
  addResearcher,
  getResearcher,
  listPapers,
  getActionItems,
  getCollaborators,
  getRealHistory,
  setScopusScore,
  clearScopusScore,
  setWosScore,
  clearWosScore,
} = require('../controllers/researcherController');
const { requireAuth } = require('../middleware/auth');
const { requirePro } = require('../middleware/requirePro');

const router = express.Router();

// Public — name search doesn't touch user data or require an account.
router.get('/search', searchResearchers);

router.use(requireAuth);

router.post('/', addResearcher);
router.get('/:id', getResearcher);
router.get('/:id/papers', listPapers);
router.get('/:id/actions', getActionItems);
router.get('/:id/collaborators', requirePro, getCollaborators);
router.get('/:id/real-history', getRealHistory);
router.patch('/:id/scopus-score', setScopusScore);
router.delete('/:id/scopus-score', clearScopusScore);
router.patch('/:id/wos-score', setWosScore);
router.delete('/:id/wos-score', clearWosScore);

module.exports = router;
