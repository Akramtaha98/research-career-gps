const express = require('express');
const {
  signup,
  login,
  me,
  googleLogin,
  orcidCallback,
  getOrcidLinkState,
  forgotPassword,
  resetPassword,
} = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.post('/signup', signup);
router.post('/login', login);
router.post('/google', googleLogin);
// GET, not POST — this is where the browser lands after ORCID's own
// redirect, not an API call the frontend makes directly.
router.get('/orcid/callback', orcidCallback);
// Auth required — mints the OAuth `state` used to link an ORCID iD to the
// currently signed-in account (see authController#getOrcidLinkState).
router.get('/orcid/link-state', requireAuth, getOrcidLinkState);
router.get('/me', requireAuth, me);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

module.exports = router;
