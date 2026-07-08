-- Research GPS - PostgreSQL schema
-- Run against Supabase (or any Postgres 13+) instance:
--   psql "$DATABASE_URL" -f schema.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(255) UNIQUE NOT NULL,
  name          VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  -- 'local' (email+password) or 'google'. Social accounts get an unusable
  -- random password_hash placeholder — see authController.js.
  auth_provider VARCHAR(20) NOT NULL DEFAULT 'local',
  -- Billing (Stripe). plan is 'free' or 'pro'; subscription_status mirrors
  -- Stripe's subscription status ('inactive', 'active', 'past_due',
  -- 'canceled', ...). See services/stripeService.js + controllers/billingController.js.
  stripe_customer_id  VARCHAR(255),
  plan                VARCHAR(20) NOT NULL DEFAULT 'free',
  subscription_status VARCHAR(20) NOT NULL DEFAULT 'inactive',
  -- Forgot-password flow: a SHA-256 hash of the emailed reset token (never
  -- the raw token) plus its expiry. Both are cleared after a successful
  -- reset or when a new request overwrites them. See authController.js.
  reset_token_hash    VARCHAR(64),
  reset_token_expires TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS researchers (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  semantic_scholar_id  VARCHAR(64) NOT NULL,
  name                 VARCHAR(255),
  h_index              INTEGER NOT NULL DEFAULT 0,
  total_citations      INTEGER NOT NULL DEFAULT 0,
  paper_count          INTEGER NOT NULL DEFAULT 0,
  -- Which upstream API this snapshot came from — 'openalex' (primary) or
  -- 'semantic_scholar' (fallback). Needed on refresh/history/collaborators
  -- calls to know which service the stored ID belongs to. See
  -- services/researcherSource.js.
  source                    VARCHAR(20) NOT NULL DEFAULT 'semantic_scholar',
  -- Optional self-reported official H-index (e.g. from Scopus or Web of
  -- Science), entered manually because neither offers a public API the app
  -- can call directly. Not automatically verified — profile_url is stored
  -- so the number can be spot-checked, and the UI links out to it. See
  -- controllers/researcherController.js#setManualScore.
  manual_h_index            INTEGER,
  manual_h_index_source     VARCHAR(20),
  manual_h_index_url        TEXT,
  manual_h_index_updated_at TIMESTAMPTZ,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, semantic_scholar_id)
);

CREATE TABLE IF NOT EXISTS papers (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  researcher_id  UUID NOT NULL REFERENCES researchers(id) ON DELETE CASCADE,
  external_id    VARCHAR(64),
  title          TEXT NOT NULL,
  year           INTEGER,
  citations      INTEGER NOT NULL DEFAULT 0,
  venue          VARCHAR(255),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS predictions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  researcher_id        UUID NOT NULL REFERENCES researchers(id) ON DELETE CASCADE,
  target_h             INTEGER NOT NULL,
  monthly_citations    NUMERIC NOT NULL,
  papers_per_year       NUMERIC NOT NULL DEFAULT 0,
  estimated_months     INTEGER,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Historical snapshots let the dashboard chart H-index growth over time.
CREATE TABLE IF NOT EXISTS h_index_history (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  researcher_id  UUID NOT NULL REFERENCES researchers(id) ON DELETE CASCADE,
  h_index        INTEGER NOT NULL,
  total_citations INTEGER NOT NULL,
  recorded_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_researchers_user_id ON researchers(user_id);
CREATE INDEX IF NOT EXISTS idx_papers_researcher_id ON papers(researcher_id);
CREATE INDEX IF NOT EXISTS idx_predictions_researcher_id ON predictions(researcher_id);
CREATE INDEX IF NOT EXISTS idx_history_researcher_id ON h_index_history(researcher_id);
CREATE INDEX IF NOT EXISTS idx_users_stripe_customer_id ON users(stripe_customer_id);
