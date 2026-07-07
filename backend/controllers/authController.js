const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const store = require('../services/store');
const { verifyGoogleToken, verifyAppleToken } = require('../services/socialAuth');

function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

function sanitizeUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    authProvider: user.auth_provider || 'local',
    created_at: user.created_at,
  };
}

/**
 * Finds the user by email, or creates one for a social sign-in. Social
 * accounts get a random, never-used password hash as a placeholder — they
 * can only ever authenticate via their provider, never via /auth/login.
 */
async function findOrCreateSocialUser({ email, name, provider }) {
  const existing = await store.findUserByEmail(email);
  if (existing) return existing;

  const placeholderPassword = crypto.randomUUID() + crypto.randomUUID();
  const passwordHash = await bcrypt.hash(placeholderPassword, 10);
  return store.createUser({
    email,
    name: name || email.split('@')[0],
    passwordHash,
    authProvider: provider,
  });
}

async function signup(req, res) {
  try {
    const { email, name, password } = req.body;
    if (!email || !name || !password) {
      return res.status(400).json({ error: 'email, name, and password are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'password must be at least 8 characters' });
    }

    const existing = await store.findUserByEmail(email.toLowerCase());
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await store.createUser({ email: email.toLowerCase(), name, passwordHash });
    const token = signToken(user);

    return res.status(201).json({ token, user: sanitizeUser(user) });
  } catch (err) {
    return res.status(500).json({ error: 'Signup failed', detail: err.message });
  }
}

async function login(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const user = await store.findUserByEmail(email.toLowerCase());
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = signToken(user);
    return res.json({ token, user: sanitizeUser(user) });
  } catch (err) {
    return res.status(500).json({ error: 'Login failed', detail: err.message });
  }
}

async function me(req, res) {
  const user = await store.findUserById(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  return res.json({ user: sanitizeUser(user) });
}

/**
 * POST /api/auth/google
 * Body: { idToken } — the credential returned by Google Identity Services
 * on the frontend after the user picks their Google account.
 */
async function googleLogin(req, res) {
  try {
    const { idToken } = req.body;
    if (!idToken) return res.status(400).json({ error: 'idToken is required' });

    const { email, name } = await verifyGoogleToken(idToken);
    const user = await findOrCreateSocialUser({ email, name, provider: 'google' });
    const token = signToken(user);
    return res.json({ token, user: sanitizeUser(user) });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
}

/**
 * POST /api/auth/apple
 * Body: { idToken, name? } — idToken is Apple's identityToken. `name` is
 * optional: Apple only includes the user's name in the one-time payload on
 * their very first sign-in, which the frontend must capture and forward
 * since it's never included in the token itself.
 */
async function appleLogin(req, res) {
  try {
    const { idToken, name } = req.body;
    if (!idToken) return res.status(400).json({ error: 'idToken is required' });

    const { email } = await verifyAppleToken(idToken);
    const user = await findOrCreateSocialUser({ email, name, provider: 'apple' });
    const token = signToken(user);
    return res.json({ token, user: sanitizeUser(user) });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
}

module.exports = { signup, login, me, googleLogin, appleLogin };
