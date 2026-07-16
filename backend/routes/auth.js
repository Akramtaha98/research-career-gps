const express = require('express');
const rateLimit = require('express-rate-limit');
const {
  signup,
  login,
  me,
  googleLogin,
  orcidCallback,
  forgotPassword,
  resetPassword,
  verifyEmail,
  resendVerificationEmail,
  updateEmailPreferences,
  unsubscribeDigest,
} = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// The app-wide limiter in server.js (300 req/15min across all of /api) is
// far too loose to stop credential stuffing, signup spam, or
// forgot-password/verification-email enumeration/flooding on their own --
// those need a much tighter, endpoint-specific ceiling. Keyed by IP (the
// rate-limit default); server.js already sets `trust proxy` so this sees
// the real client IP behind Railway's reverse proxy, not the proxy's own.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait a few minutes and try again.' },
  // Same escape hatch as ENABLE_SNAPSHOT_CRON/ENABLE_DIGEST_CRON elsewhere in
  // this app: the integration tests (tests/auth.test.js, tests/predictions.test.js)
  // legitimately make more than 20 requests against these shared-bucket
  // routes in a single run, so they set DISABLE_RATE_LIMIT=true. Must never
  // be set in a real deployment — see backend/.env.example.
  skip: () => process.env.DISABLE_RATE_LIMIT === 'true',
});

router.post('/signup', authLimiter, signup);
router.post('/login', authLimiter, login);
router.post('/google', googleLogin);
// GET, not POST — this is where the browser lands after ORCID's own
// redirect, not an API call the frontend makes directly.
router.get('/orcid/callback', orcidCallback);
router.get('/me', requireAuth, me);
router.post('/forgot-password', authLimiter, forgotPassword);
router.post('/reset-password', authLimiter, resetPassword);
router.post('/verify-email', authLimiter, verifyEmail);
router.post('/resend-verification', authLimiter, requireAuth, resendVerificationEmail);
router.patch('/email-preferences', requireAuth, updateEmailPreferences);
// GET, not POST/PATCH — this is a one-click link clicked straight from an
// email client, not an API call the frontend makes.
router.get('/unsubscribe-digest', unsubscribeDigest);

module.exports = router;
