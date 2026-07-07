const express = require('express');
const {
  searchResearchers,
  addResearcher,
  getResearcher,
  listPapers,
  getActionItems,
} = require('../controllers/researcherController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Public — name search doesn't touch user data or require an account.
router.get('/search', searchResearchers);

router.use(requireAuth);

router.post('/', addResearcher);
router.get('/:id', getResearcher);
router.get('/:id/papers', listPapers);
router.get('/:id/actions', getActionItems);

module.exports = router;
