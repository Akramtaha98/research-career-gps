const express = require('express');
const { runVerification, getVerification, getVerificationHistory } = require('../controllers/verificationController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Every verification action is tied to a signed-in user (submitted_by, for
// audit purposes) — same convention as the rest of the write-heavy routes in
// this app (researchers.js, predictions.js).
router.use(requireAuth);

router.post('/', runVerification);
// Must be registered before a future '/:orcid/something-else' route if one
// is ever added with a conflicting shape — not an issue today since these
// two are the only '/:orcid...' routes.
router.get('/:orcid/history', getVerificationHistory);
router.get('/:orcid', getVerification);

module.exports = router;
