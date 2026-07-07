const express = require('express');
const { signup, login, me, googleLogin, appleLogin } = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.post('/signup', signup);
router.post('/login', login);
router.post('/google', googleLogin);
router.post('/apple', appleLogin);
router.get('/me', requireAuth, me);

module.exports = router;
