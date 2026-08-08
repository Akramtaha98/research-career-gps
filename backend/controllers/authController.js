const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const store = require('../services/store');
const { verifyGoogleToken } = require('../services/socialAuth');
const { exchangeOrcidCode } = require('../services/orcidAuth');
const { sendPasswordResetEmail, sendVerificationEmail } = require('../services/email');
const { sendError } = require('../utils/sendError');

// Signup-confirmation links expire in 24h — longer than the 1h password-reset
// window since there's no account-takeover risk in someone confirming an
// email later (unlike a stale reset link staying valid).
const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

/** Generates a random token + its SHA-256 hash — shared by both the forgot-password and email-verification flows (only the hash is ever persisted). */
function generateHashedToken() {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  return { rawToken, tokenHash };
}

/** Best-effort send of the signup-confirmation email; never throws — a delivery failure must not block signup. */
async function sendVerificationEmailBestEffort(user) {
  try {
    const { rawToken, tokenHash } = generateHashedToken();
    const expiresAt = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS);
    await store.setEmailVerificationToken(user.id, { tokenHash, expiresAt });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const verifyUrl = `${frontendUrl}/verify-email?token=${rawToken}`;
    await sendVerificationEmail({ to: user.email, name: user.name, verifyUrl });
  } catch (err) {
    console.error('Failed to send verification email:', err.message);
  }
}

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
    // OAuth-confirmed ORCID iD (not user-typed) — used client-side as a
    // cross-check hint next to self-reported Scopus/WOS numbers.
    orcid: user.orcid || null,
    plan: user.plan || 'free',
    subscriptionStatus: user.subscription_status || 'inactive',
    emailVerified: user.email_verified !== false,
    digestSubscribed: user.digest_subscribed !== false,
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
    // Google has already confirmed this address; no confirmation email needed.
    emailVerified: true,
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
    const user = await store.createUser({
      email: email.toLowerCase(),
      name,
      passwordHash,
      emailVerified: false,
    });
    const token = signToken(user);

    // Best-effort — a failed send never blocks account creation; the user
    // can always request a new link via /auth/resend-verification.
    sendVerificationEmailBestEffort(user);

    return res.status(201).json({ token, user: sanitizeUser(user) });
  } catch (err) {
    return sendError(res, err, 'Signup failed');
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
    return sendError(res, err, 'Login failed');
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
    return sendError(res, err);
  }
}

/**
 * Finds the user by ORCID iD, or creates one. ORCID's /authenticate scope
 * only guarantees an ORCID iD + display name — no email — so unlike Google
 * sign-in, accounts are keyed by orcid rather than email, and get a
 * placeholder, never-shown, non-colliding email so the existing NOT NULL
 * UNIQUE email column stays satisfied.
 */
async function findOrCreateOrcidUser({ orcid, name }) {
  const existing = await store.findUserByOrcid(orcid);
  if (existing) return existing;

  const placeholderPassword = crypto.randomUUID() + crypto.randomUUID();
  const passwordHash = await bcrypt.hash(placeholderPassword, 10);
  return store.createUser({
    email: `orcid-${orcid}@orcid.researchgps.local`,
    name: name || `ORCID ${orcid}`,
    passwordHash,
    authProvider: 'orcid',
    orcid,
    // Placeholder, never-delivered address — nothing to confirm by email.
    emailVerified: true,
  });
}

/**
 * GET /api/auth/orcid/callback?code=...
 * Where ORCID redirects the browser back to after the user approves sign-in
 * at orcid.org/oauth/authorize. Runs entirely server-side (the code-for-
 * token exchange needs the Client Secret), then hands off to the frontend
 * by redirecting again with the app's own JWT in the URL fragment — a
 * fragment (not a query string) so the token never lands in server access
 * logs or gets forwarded via a Referer header.
 */
async function orcidCallback(req, res) {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const failRedirect = (message) =>
    res.redirect(`${frontendUrl}/auth/orcid/callback#error=${encodeURIComponent(message)}`);

  try {
    const { code, error, error_description: errorDescription } = req.query;
    if (error) return failRedirect(errorDescription || error);
    if (!code) return failRedirect('missing_code');
    if (!process.env.ORCID_REDIRECT_URI) return failRedirect('ORCID_REDIRECT_URI is not configured on the server');

    const { orcid, name } = await exchangeOrcidCode(code, process.env.ORCID_REDIRECT_URI);
    const user = await findOrCreateOrcidUser({ orcid, name });
    const token = signToken(user);
    return res.redirect(`${frontendUrl}/auth/orcid/callback#token=${encodeURIComponent(token)}`);
  } catch (err) {
    return failRedirect(err.message);
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
      const { rawToken, tokenHash } = generateHashedToken();
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
    return sendError(res, err, 'Request failed');
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
    return sendError(res, err, 'Reset failed');
  }
}

/**
 * POST /api/auth/verify-email
 * Body: { token }
 * Confirms a signup — flips email_verified to true and clears the token so
 * it can't be replayed. Returns the refreshed user so the frontend can
 * update its own state without an extra /auth/me round trip.
 */
async function verifyEmail(req, res) {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ error: 'token is required' });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const user = await store.findUserByValidVerificationToken(tokenHash);
    if (!user) {
      return res.status(400).json({ error: 'This confirmation link is invalid or has expired' });
    }

    const updated = await store.markEmailVerified(user.id);
    return res.json({ message: 'Email confirmed', user: sanitizeUser(updated) });
  } catch (err) {
    return sendError(res, err, 'Verification failed');
  }
}

/**
 * POST /api/auth/resend-verification
 * Requires auth (the signed-in user resending their own confirmation link,
 * same as clicking "resend" from the in-app banner). No-op with a friendly
 * message if the account is already confirmed.
 */
async function resendVerificationEmail(req, res) {
  try {
    const user = await store.findUserById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.email_verified) {
      return res.json({ message: 'This email is already confirmed.' });
    }
    if (user.auth_provider !== 'local') {
      return res.json({ message: 'This account does not need email confirmation.' });
    }

    await sendVerificationEmailBestEffort(user);
    return res.json({ message: 'Confirmation email sent. Check your inbox.' });
  } catch (err) {
    return sendError(res, err, 'Could not send confirmation email');
  }
}

/**
 * PATCH /api/auth/email-preferences
 * Body: { digestSubscribed: boolean }
 * Toggles the weekly goal-progress digest (see services/digestScheduler.js).
 * Requires auth — this is a self-service preference, not a public endpoint.
 */
async function updateEmailPreferences(req, res) {
  try {
    const { digestSubscribed } = req.body;
    if (typeof digestSubscribed !== 'boolean') {
      return res.status(400).json({ error: 'digestSubscribed (boolean) is required' });
    }

    const updated = await store.updateDigestSubscription(req.user.id, digestSubscribed);
    if (!updated) return res.status(404).json({ error: 'User not found' });

    return res.json({ user: sanitizeUser(updated) });
  } catch (err) {
    return sendError(res, err, 'Update failed');
  }
}

/**
 * GET /api/auth/unsubscribe-digest?token=...
 * One-click unsubscribe link embedded in every weekly digest email (see
 * services/digestScheduler.js) — deliberately a plain signed-JWT GET link
 * rather than requiring the recipient to sign in first, matching standard
 * "unsubscribe" UX/email-deliverability expectations. The JWT's only claim
 * is the user id + a `purpose` guard so a leaked/forwarded link can't be
 * reused for anything else (e.g. it will NOT pass requireAuth's checks).
 */
async function unsubscribeDigest(req, res) {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  try {
    const { token } = req.query;
    if (!token) return res.redirect(`${frontendUrl}/predictor`);

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.purpose !== 'digest-unsubscribe') {
      return res.redirect(`${frontendUrl}/predictor`);
    }

    await store.updateDigestSubscription(payload.sub, false);
    return res.redirect(`${frontendUrl}/predictor?digestUnsubscribed=1`);
  } catch {
    // Expired/invalid token — fail open to the app rather than an error page.
    return res.redirect(`${frontendUrl}/predictor`);
  }
}

module.exports = {
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
};
