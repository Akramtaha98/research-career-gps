const express = require('express');
const { createSession, getStatus } = require('../controllers/billingController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);
router.post('/create-checkout-session', createSession);
router.get('/status', getStatus);

// NOTE: POST /api/billing/webhook is intentionally NOT in this router — it
// needs express.raw() body parsing and no auth, so it's mounted directly on
// the app in server.js, before the global express.json() middleware.

module.exports = router;
