-- Migration: adds paper_count + citations alongside h_index for both the
-- private self-reported Scopus/WOS fields and the shared/crowdsourced pool.
-- Run this against your live database the same way as 002 — see that file
-- for instructions. Every statement here is idempotent (safe to re-run).
--
--   psql "$DATABASE_URL" -f backend/migrations/003_paper_count_and_citations.sql
--
-- or paste into the Supabase SQL editor and run it there.

ALTER TABLE researchers ADD COLUMN IF NOT EXISTS scopus_paper_count INTEGER;
ALTER TABLE researchers ADD COLUMN IF NOT EXISTS scopus_citations INTEGER;
ALTER TABLE researchers ADD COLUMN IF NOT EXISTS wos_paper_count INTEGER;
ALTER TABLE researchers ADD COLUMN IF NOT EXISTS wos_citations INTEGER;

ALTER TABLE shared_scores ADD COLUMN IF NOT EXISTS paper_count INTEGER;
ALTER TABLE shared_scores ADD COLUMN IF NOT EXISTS citations INTEGER;

ALTER TABLE shared_scores_history ADD COLUMN IF NOT EXISTS paper_count INTEGER;
ALTER TABLE shared_scores_history ADD COLUMN IF NOT EXISTS citations INTEGER;
