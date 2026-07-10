const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const store = require('../services/store');
const { verifyGoogleToken } = require('../services/socialAuth');
const { exchangeOrcidCode } = require('../services/orcidAuth');
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
    // OAuth-confirmed ORCID iD (not user-typed) — used client-side as a
    // cross-check hint next to self-reported Scopus/WOS numbers.
    orcid: user.orcid || null,
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
  });
}

/**
 * GET /api/auth/orcid/link-state  (auth required)
 * Mints a short-lived, single-purpose token identifying the signed-in user,
 * to be passed as the OAuth `state` when they click "Connect ORCID". The
 * ORCID callback below trusts this to know WHICH existing account to attach
 * the returned ORCID iD to. Purpose-scoped and short-lived so that, even if
 * it leaks via the redirect chain, it can't be used as a general auth token.
 */
async function getOrcidLinkState(req, res) {
  const state = jwt.sign({ sub: req.user.id, purpose: 'orcid-link' }, process.env.JWT_SECRET, {
    expiresIn: '10m',
  });
  return res.json({ state });
}

/**
 * GET /api/auth/orcid/callback?code=...&state=...
 * Where ORCID redirects the browser back to after the user approves the
 * flow at orcid.org. Runs entirely server-side (the code-for-token exchange
 * needs the Client Secret), then hands off to the frontend by redirecting
 * with the app's own JWT in the URL fragment — a fragment (not a query
 * string) so the token never lands in server access logs or a Referer.
 *
 * Two modes, distinguished by the OAuth `state`:
 *  - No/!link state  → plain SIGN-IN: find-or-create an account keyed by ORCID.
 *  - Valid link state → LINK: attach this ORCID to the already-signed-in
 *    account named by the state token, instead of minting a separate account
 *    (this is what stops one person from splitting into an email account +
 *    an ORCID account — see the account-merge history).
 */
async function orcidCallback(req, res) {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const failRedirect = (message) =>
    res.redirect(`${frontendUrl}/auth/orcid/callback#error=${encodeURIComponent(message)}`);

  try {
    const { code, state, error, error_description: errorDescription } = req.query;
    if (error) return failRedirect(errorDescription || error);
    if (!code) return failRedirect('missing_code');
    if (!process.env.ORCID_REDIRECT_URI) return failRedirect('ORCID_REDIRECT_URI is not configured on the server');

    // Is this a "Connect ORCID" link request from an already-signed-in user?
    let linkUserId = null;
    if (state) {
      try {
        const decoded = jwt.verify(state, process.env.JWT_SECRET);
        if (decoded.purpose === 'orcid-link') linkUserId = decoded.sub;
      } catch {
        return failRedirect('Your Connect-ORCID request expired or was invalid. Please try again.');
      }
    }

    const { orcid, name } = await exchangeOrcidCode(code, process.env.ORCID_REDIRECT_URI);

    if (linkUserId) {
      const account = await store.findUserById(linkUserId);
      if (!account) return failRedirect('The account to link to no longer exists.');

      const holder = await store.findUserByOrcid(orcid);
      if (holder && holder.id !== account.id) {
        return failRedirect('That ORCID iD is already linked to a different Research GPS account.');
      }
      if (account.orcid && account.orcid !== orcid) {
        return failRedirect('Your account already has a different ORCID iD linked.');
      }

      const updated = (await store.setUserOrcid(account.id, orcid)) || account;
      const token = signToken(updated);
      return res.redirect(`${frontendUrl}/auth/orcid/callback#token=${encodeURIComponent(token)}&linked=1`);
    }

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

module.exports = {
  signup,
  login,
  me,
  googleLogin,
  orcidCallback,
  getOrcidLinkState,
  forgotPassword,
  resetPassword,
};
