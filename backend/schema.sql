-- Research Career GPS - PostgreSQL schema
-- Run against Supabase (or any Postgres 13+) instance:
--   psql "$DATABASE_URL" -f schema.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(255) UNIQUE NOT NULL,
  name          VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
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
