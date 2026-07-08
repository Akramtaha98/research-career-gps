const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const store = require('../services/store');
const { verifyGoogleToken } = require('../services/socialAuth');
const { sendPasswordResetEmail } = require('../services/email');

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
    plan: user.plan || 'free',
    subscriptionStatus: user.subscription_status || 'inactive',
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
 * POST /api/auth/forgot-password
 * Body: { email }
 *
 * Always responds 200 with a generic message, whether or not the email
 * matches an account — this avoids leaking which emails are registered.
 * Social-only accounts (auth_provider !== 'local') don't have a usable
 * password to reset, so they're silently skipped too (same generic response).
 */
async function forgotPassword(req, res) {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'email is required' });
    }

    const genericMessage = 'If an account exists for that email, a reset link has been sent.';
    const user = await store.findUserByEmail(email.toLowerCase());

    if (user && user.auth_provider === 'local') {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await store.setResetToken(user.id, { tokenHash, expiresAt });

      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      const resetUrl = `${frontendUrl}/reset-password?token=${rawToken}`;

      try {
        await sendPasswordResetEmail({ to: user.email, resetUrl });
      } catch (emailErr) {
        console.error('Failed to send password reset email:', emailErr.message);
        // Don't leak email-sending failures to the client — still return the
        // generic message so we don't reveal account existence or internals.
      }
    }

    return res.json({ message: genericMessage });
  } catch (err) {
    return res.status(500).json({ error: 'Request failed', detail: err.message });
  }
}

/**
 * POST /api/auth/reset-password
 * Body: { token, password }
 */
async function resetPassword(req, res) {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ error: 'token and password are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'password must be at least 8 characters' });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const user = await store.findUserByValidResetToken(tokenHash);
    if (!user) {
      return res.status(400).json({ error: 'This reset link is invalid or has expired' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await store.resetPassword(user.id, passwordHash);

    return res.json({ message: 'Password reset successfully' });
  } catch (err) {
    return res.status(500).json({ error: 'Reset failed', detail: err.message });
  }
}

module.exports = { signup, login, me, googleLogin, forgotPassword, resetPassword };
