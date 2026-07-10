-- Migration: adds researchers.orcid + the shared/crowdsourced Scopus-WOS
-- tables to an EXISTING database. schema.sql's CREATE TABLE IF NOT EXISTS
-- blocks only run once, on a brand-new database — they do NOT retroactively
-- add new columns to a table that already exists. Run this against your
-- live database once to catch it up.
--
-- Safe to run more than once (every statement is idempotent) and safe to run
-- even if some pieces were already applied by an earlier migration.
--
--   psql "$DATABASE_URL" -f backend/migrations/002_orcid_and_shared_scores.sql
--
-- or paste the contents into the Supabase SQL editor and run it there.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- users.orcid — the app user's own OAuth-confirmed ORCID (Sign in with ORCID).
ALTER TABLE users ADD COLUMN IF NOT EXISTS orcid VARCHAR(19);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_orcid_key'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_orcid_key UNIQUE (orcid);
  END IF;
END $$;

-- researchers.orcid — the TRACKED PERSON's own ORCID (not the app user's).
ALTER TABLE researchers ADD COLUMN IF NOT EXISTS orcid VARCHAR(19);

-- Self-reported Scopus/WOS columns (from an earlier feature this session —
-- included here too in case this database never got that migration either).
ALTER TABLE researchers ADD COLUMN IF NOT EXISTS scopus_h_index INTEGER;
ALTER TABLE researchers ADD COLUMN IF NOT EXISTS scopus_url TEXT;
ALTER TABLE researchers ADD COLUMN IF NOT EXISTS scopus_updated_at TIMESTAMPTZ;
ALTER TABLE researchers ADD COLUMN IF NOT EXISTS wos_h_index INTEGER;
ALTER TABLE researchers ADD COLUMN IF NOT EXISTS wos_url TEXT;
ALTER TABLE researchers ADD COLUMN IF NOT EXISTS wos_updated_at TIMESTAMPTZ;

-- Crowdsourced Scopus/WOS pool — see schema.sql's shared_scores comment for
-- the full verification-model rationale.
CREATE TABLE IF NOT EXISTS shared_scores (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orcid         VARCHAR(19) NOT NULL,
  which         VARCHAR(10) NOT NULL CHECK (which IN ('scopus', 'wos')),
  h_index       INTEGER NOT NULL,
  profile_url   TEXT,
  status        VARCHAR(20) NOT NULL DEFAULT 'unverified' CHECK (status IN ('unverified', 'verified')),
  submitted_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  submitted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  verified_at   TIMESTAMPTZ,
  UNIQUE (orcid, which)
);

CREATE TABLE IF NOT EXISTS shared_scores_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seq           BIGSERIAL,
  orcid         VARCHAR(19) NOT NULL,
  which         VARCHAR(10) NOT NULL CHECK (which IN ('scopus', 'wos')),
  h_index       INTEGER NOT NULL,
  profile_url   TEXT,
  result_status VARCHAR(20) NOT NULL,
  submitted_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  submitted_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_researchers_orcid ON researchers(orcid);
CREATE INDEX IF NOT EXISTS idx_shared_scores_orcid ON shared_scores(orcid);
CREATE INDEX IF NOT EXISTS idx_shared_scores_history_orcid ON shared_scores_history(orcid, which);
