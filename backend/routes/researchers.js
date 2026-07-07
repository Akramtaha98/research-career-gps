const express = require('express');
const {
  addResearcher,
  getResearcher,
  listPapers,
  getActionItems,
} = require('../controllers/researcherController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

router.post('/', addResearcher);
router.get('/:id', getResearcher);
router.get('/:id/papers', listPapers);
router.get('/:id/actions', getActionItems);

module.exports = router;
