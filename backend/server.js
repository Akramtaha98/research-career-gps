require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const researcherRoutes = require('./routes/researchers');
const predictionRoutes = require('./routes/predictions');
const billingRoutes = require('./routes/billing');
const verificationRoutes = require('./routes/verification');
const contactRoutes = require('./routes/contact');
const { webhook: billingWebhook } = require('./controllers/billingController');
const { isDemoMode } = require('./config/db');
const { startSnapshotScheduler } = require('./services/snapshotScheduler');
const { startDigestScheduler } = require('./services/digestScheduler');

const app = express();
const PORT = process.env.PORT || 4000;

// A short or placeholder JWT_SECRET makes every issued auth token forgeable
// -- this is the single most damaging misconfiguration this app could ship
// with, so it gets a loud startup warning (not a hard crash, to avoid
// breaking local dev before .env is filled in) rather than silently signing
// tokens with a weak key.
const weakSecrets = new Set(['replace-with-a-long-random-string', 'secret', 'changeme', 'test-secret']);
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 || weakSecrets.has(process.env.JWT_SECRET)) {
  // eslint-disable-next-line no-console
  console.warn(
    'WARNING: JWT_SECRET is missing, short, or a known placeholder value. Set a long random string (32+ chars) — anyone who guesses it can forge login tokens for any account.'
  );
}

// Railway (like most PaaS hosts) puts the app behind a reverse proxy that
// adds an X-Forwarded-For header with the real client IP. Express doesn't
// trust that header by default, which makes express-rate-limit below unable
// to tell users apart (it'd see the proxy's IP for everyone) and throws the
// ERR_ERL_UNEXPECTED_X_FORWARDED_FOR warning. Trusting exactly 1 hop tells
// Express "believe the X-Forwarded-For value added by the first proxy in
// front of me" — safer than `true` (trust all), which would let a client
// spoof their own IP by sending a fake header.
app.set('trust proxy', 1);

// Sets the standard security-header baseline (X-Content-Type-Options,
// X-Frame-Options, Strict-Transport-Security, X-Powered-By removed, etc).
//   - contentSecurityPolicy: off — this server only ever serves JSON (the
//     frontend is a separate static SPA on Vercel); helmet's default CSP is
//     meant for HTML-serving apps and would just add noise here.
//   - crossOriginResourcePolicy: 'cross-origin' — helmet's default
//     ('same-origin') would let browsers block the frontend (a different
//     origin on Vercel) from reading this API's responses even when CORS
//     headers allow it. Safe to relax here since every response is public
//     JSON gated by its own auth check, not a same-origin-only asset.
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// FRONTEND_ORIGIN accepts one origin or a comma-separated list (useful once
// a custom domain is added alongside the existing *.vercel.app one, or for
// preview deployments) — falls back to '*' only for local development
// convenience. Warned about below if that fallback is ever active in
// production, since an unrestricted CORS origin is meant to be a temporary/
// dev-only default, not a production setting.
const allowedOrigins = (process.env.FRONTEND_ORIGIN || '*')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

if (process.env.NODE_ENV === 'production' && allowedOrigins.includes('*')) {
  // eslint-disable-next-line no-console
  console.warn(
    'WARNING: FRONTEND_ORIGIN is not set (or set to "*") in production — CORS is wide open to any origin. Set FRONTEND_ORIGIN to your real frontend URL(s).'
  );
}

app.use(cors({ origin: allowedOrigins.includes('*') ? '*' : allowedOrigins }));

// Stripe webhook needs the raw request body for signature verification, so
// it must be mounted BEFORE express.json() and must not go through it.
app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), billingWebhook);

app.use(express.json());

// Basic global rate limit; Semantic Scholar's own limit (100 req/5min) is
// handled separately in services/semanticScholar.js. See routes/auth.js's
// authLimiter comment for the DISABLE_RATE_LIMIT test-only escape hatch.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  skip: () => process.env.DISABLE_RATE_LIMIT === 'true',
});
app.use('/api', limiter);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', demoMode: isDemoMode, timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/researchers', researcherRoutes);
app.use('/api/predictions', predictionRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/verify', verificationRoutes);
app.use('/api/contact', contactRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

// Only bind a port and start the cron schedulers when this file is run
// directly (`node server.js` / `npm start`) — not when it's `require()`d as
// a module, e.g. by the integration tests in tests/*.test.js via supertest,
// which drive the Express app in-process against an ephemeral port of their
// own and must never accidentally schedule real cron jobs or fight over
// PORT with a dev server that's already running.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Research GPS API listening on port ${PORT} (demoMode=${isDemoMode})`);
    startSnapshotScheduler();
    startDigestScheduler();
  });
}

module.exports = app;
