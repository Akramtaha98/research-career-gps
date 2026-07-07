const express = require('express');
const { createPrediction } = require('../controllers/predictionController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);
router.post('/', createPrediction);

module.exports = router;
