-- Migration: adds papers.origin so manually-imported Scopus/WOS CSV papers
-- (origin='import') survive future OpenAlex/Semantic Scholar refreshes,
-- which only replace the auto-fetched rows (origin='auto'). Run the same
-- way as 002/003 — see those files for instructions.
--
--   psql "$DATABASE_URL" -f backend/migrations/004_paper_origin.sql

ALTER TABLE papers ADD COLUMN IF NOT EXISTS origin VARCHAR(20) NOT NULL DEFAULT 'auto';
