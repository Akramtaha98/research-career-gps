const express = require('express');
const { createPrediction } = require('../controllers/predictionController');
const { requireAuth } = require('../middleware/auth');
const { requirePro } = require('../middleware/requirePro');

const router = express.Router();

router.use(requireAuth);
router.post('/', requirePro, createPrediction);

module.exports = router;
