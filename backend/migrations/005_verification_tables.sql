-- Migration: adds the standalone academic-information VERIFICATION system
-- tables (separate from the "tracked researcher" Dashboard tables) — see
-- schema.sql's comment above these tables, and services/verificationService.js,
-- for the full design. Run the same way as 002/003/004 — see those files for
-- instructions.
--
--   psql "$DATABASE_URL" -f backend/migrations/005_verification_tables.sql

CREATE TABLE IF NOT EXISTS verified_authors (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orcid                       VARCHAR(19) UNIQUE NOT NULL,
  submitted_name              TEXT,
  verified_name               TEXT,
  submitted_affiliation       TEXT,
  verified_affiliation        TEXT,
  openalex_author_id          VARCHAR(64),
  semantic_scholar_author_id  VARCHAR(64),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS verified_author_metrics (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id                 UUID NOT NULL REFERENCES verified_authors(id) ON DELETE CASCADE,
  submitted_h_index         INTEGER,
  verified_h_index          INTEGER,
  submitted_paper_count     INTEGER,
  verified_paper_count      INTEGER,
  submitted_citation_count  INTEGER,
  verified_citation_count   INTEGER,
  source                    VARCHAR(20) NOT NULL CHECK (source IN ('semantic_scholar', 'openalex')),
  verification_status       VARCHAR(20) NOT NULL CHECK (verification_status IN ('verified', 'partial', 'unverifiable')),
  submitted_by              UUID REFERENCES users(id) ON DELETE SET NULL,
  verified_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS verified_papers (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id      UUID NOT NULL REFERENCES verified_authors(id) ON DELETE CASCADE,
  external_id    VARCHAR(64),
  doi            VARCHAR(255),
  title          TEXT NOT NULL,
  year           INTEGER,
  venue          VARCHAR(255),
  citation_count INTEGER NOT NULL DEFAULT 0,
  source         VARCHAR(20) NOT NULL CHECK (source IN ('semantic_scholar', 'openalex')),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS verified_comparison_results (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_metrics_id   UUID NOT NULL REFERENCES verified_author_metrics(id) ON DELETE CASCADE,
  field_name          VARCHAR(50) NOT NULL,
  submitted_value     TEXT,
  verified_value      TEXT,
  difference          NUMERIC,
  match               BOOLEAN NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_verified_authors_orcid ON verified_authors(orcid);
CREATE INDEX IF NOT EXISTS idx_verified_author_metrics_author_id ON verified_author_metrics(author_id);
CREATE INDEX IF NOT EXISTS idx_verified_papers_author_id ON verified_papers(author_id);
CREATE INDEX IF NOT EXISTS idx_verified_comparison_results_metrics_id ON verified_comparison_results(author_metrics_id);
