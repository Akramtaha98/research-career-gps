const express = require('express');
const rateLimit = require('express-rate-limit');
const { submitContactMessage } = require('../controllers/contactController');

const router = express.Router();

// Public form, no auth — tighter rate limit than the app-wide default since
// this endpoint has no login gate at all to slow down spam/abuse on its own.
const contactLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });

router.post('/', contactLimiter, submitContactMessage);

module.exports = router;
