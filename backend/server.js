require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const researcherRoutes = require('./routes/researchers');
const predictionRoutes = require('./routes/predictions');
const billingRoutes = require('./routes/billing');
const verificationRoutes = require('./routes/verification');
const { webhook: billingWebhook } = require('./controllers/billingController');
const { isDemoMode } = require('./config/db');

const app = express();
const PORT = process.env.PORT || 4000;

// Railway (like most PaaS hosts) puts the app behind a reverse proxy that
// adds an X-Forwarded-For header with the real client IP. Express doesn't
// trust that header by default, which makes express-rate-limit below unable
// to tell users apart (it'd see the proxy's IP for everyone) and throws the
// ERR_ERL_UNEXPECTED_X_FORWARDED_FOR warning. Trusting exactly 1 hop tells
// Express "believe the X-Forwarded-For value added by the first proxy in
// front of me" — safer than `true` (trust all), which would let a client
// spoof their own IP by sending a fake header.
app.set('trust proxy', 1);

app.use(cors({ origin: process.env.FRONTEND_ORIGIN || '*' }));

// Stripe webhook needs the raw request body for signature verification, so
// it must be mounted BEFORE express.json() and must not go through it.
app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), billingWebhook);

app.use(express.json());

// Basic global rate limit; Semantic Scholar's own limit (100 req/5min) is
// handled separately in services/semanticScholar.js.
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300 });
app.use('/api', limiter);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', demoMode: isDemoMode, timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/researchers', researcherRoutes);
app.use('/api/predictions', predictionRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/verify', verificationRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Research GPS API listening on port ${PORT} (demoMode=${isDemoMode})`);
});

module.exports = app;
