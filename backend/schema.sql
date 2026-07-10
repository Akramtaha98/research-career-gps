-- Research GPS - PostgreSQL schema
-- Run against Supabase (or any Postgres 13+) instance:
--   psql "$DATABASE_URL" -f schema.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(255) UNIQUE NOT NULL,
  name          VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  -- 'local' (email+password), 'google', or 'orcid'. Social accounts get an
  -- unusable random password_hash placeholder — see authController.js.
  auth_provider VARCHAR(20) NOT NULL DEFAULT 'local',
  -- Set for auth_provider = 'orcid' — the OAuth-verified ORCID iD (e.g.
  -- "0000-0002-1825-0097"), returned directly by ORCID's token endpoint on
  -- sign-in, so this is confirmed-by-ORCID, not user-typed. Used to find-or-
  -- create the account and, in the UI, as an honest cross-check hint next to
  -- self-reported Scopus/WOS numbers ("does this match the ORCID on the
  -- profile page you're copying from?"). See services/orcidAuth.js.
  orcid         VARCHAR(19) UNIQUE,
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
  -- The TRACKED PERSON's own ORCID iD (not the app user's — see users.orcid
  -- for that). Populated from the upstream profile (openAlex.js) whenever
  -- the author has one on file. This is the join key for the shared/
  -- crowdsourced Scopus/WOS pool below (shared_scores) — without it, a
  -- researcher's self-reported numbers stay private to whoever added them,
  -- since there's no reliable way to know two different users' "researchers"
  -- rows refer to the same real person otherwise.
  orcid                 VARCHAR(19),
  -- Optional self-reported official H-index numbers, entered manually
  -- because neither Scopus nor Web of Science offers a public API this app
  -- can call directly (see services/openAlex.js history for why). Scopus
  -- and WOS are tracked as two independent slots — a researcher may have
  -- one, both, or neither. Not automatically verified against the source;
  -- *_url stores the profile link so it can be spot-checked, and when the
  -- signed-in user authenticated via ORCID, the UI shows their confirmed
  -- ORCID next to the input as a cross-check hint ("does this match the
  -- ORCID on the profile page?"). See controllers/researcherController.js.
  scopus_h_index        INTEGER,
  -- Full Scopus/WOS document + citation counts, alongside h-index. Optional —
  -- a user may only know their h-index, or may fill in all three. Lets the
  -- Dashboard show "4 documents, 3 citations, h-index 1" instead of just the
  -- h-index, matching what the real Scopus/WOS profile page shows.
  scopus_paper_count     INTEGER,
  scopus_citations       INTEGER,
  scopus_url             TEXT,
  scopus_updated_at      TIMESTAMPTZ,
  wos_h_index            INTEGER,
  wos_paper_count        INTEGER,
  wos_citations          INTEGER,
  wos_url                 TEXT,
  wos_updated_at          TIMESTAMPTZ,
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
  -- 'auto' (fetched from OpenAlex/Semantic Scholar, replaced wholesale on
  -- every add/refresh) vs 'import' (manually added from a Scopus/WOS CSV
  -- export via the Import page — survives refreshes since replacePapers()
  -- only clears 'auto' rows, not these). See services/store.js
  -- mergeImportedPapers.
  origin         VARCHAR(20) NOT NULL DEFAULT 'auto',
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

-- Crowdsourced Scopus/WOS pool: ONE canonical current value per (orcid, which),
-- shared across every user who searches for that researcher — this is what
-- replaces the old "each user has their own private number" model. Verification
-- model (user-selected): the researcher's OWN ORCID-authenticated account
-- (users.orcid matches this row's orcid) can submit a value that's
-- immediately marked verified and becomes canonical, overwriting whatever was
-- there. Anyone else's submission is stored as 'unverified' and shown as such;
-- it can still become the displayed "current" value if nothing verified
-- exists yet, but once a verified value exists, non-owner submissions no
-- longer silently overwrite it (see submitSharedScore in store.js) — they're
-- only recorded in shared_scores_history as suggestions.
CREATE TABLE IF NOT EXISTS shared_scores (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orcid         VARCHAR(19) NOT NULL,
  which         VARCHAR(10) NOT NULL CHECK (which IN ('scopus', 'wos')),
  h_index       INTEGER NOT NULL,
  -- Full document + citation counts, alongside h-index — optional, same
  -- reasoning as researchers.scopus_paper_count above.
  paper_count   INTEGER,
  citations     INTEGER,
  profile_url   TEXT,
  status        VARCHAR(20) NOT NULL DEFAULT 'unverified' CHECK (status IN ('unverified', 'verified')),
  submitted_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  submitted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  verified_at   TIMESTAMPTZ,
  UNIQUE (orcid, which)
);

-- Append-only log of every submission ever made to the shared pool (including
-- ones that didn't become "current" because a verified value already stood) —
-- this is the update/history trail the user asked for, and doubles as an
-- audit log if a submission ever needs to be investigated/disputed.
CREATE TABLE IF NOT EXISTS shared_scores_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Monotonic tiebreaker for ordering — submitted_at alone can collide when
  -- two submissions land in the same instant, and UUIDs aren't sequential.
  seq           BIGSERIAL,
  orcid         VARCHAR(19) NOT NULL,
  which         VARCHAR(10) NOT NULL CHECK (which IN ('scopus', 'wos')),
  h_index       INTEGER NOT NULL,
  paper_count   INTEGER,
  citations     INTEGER,
  profile_url   TEXT,
  -- 'verified' | 'unverified' | 'suggestion' — what this specific submission
  -- resulted in (a 'suggestion' is one that was recorded but did NOT become
  -- the current value because a verified value already existed).
  result_status VARCHAR(20) NOT NULL,
  submitted_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  submitted_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_researchers_user_id ON researchers(user_id);
CREATE INDEX IF NOT EXISTS idx_researchers_orcid ON researchers(orcid);
CREATE INDEX IF NOT EXISTS idx_papers_researcher_id ON papers(researcher_id);
CREATE INDEX IF NOT EXISTS idx_predictions_researcher_id ON predictions(researcher_id);
CREATE INDEX IF NOT EXISTS idx_history_researcher_id ON h_index_history(researcher_id);
CREATE INDEX IF NOT EXISTS idx_users_stripe_customer_id ON users(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_shared_scores_orcid ON shared_scores(orcid);
CREATE INDEX IF NOT EXISTS idx_shared_scores_history_orcid ON shared_scores_history(orcid, which);
