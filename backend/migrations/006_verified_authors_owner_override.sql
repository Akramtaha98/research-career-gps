-- Migration: adds ORCID-owner override columns to verified_authors — lets
-- the actual ORCID owner (signed in via ORCID, account orcid matches the
-- verified orcid) submit their real numbers as an authoritative correction,
-- shown alongside the raw Semantic Scholar/OpenAlex snapshot. See
-- schema.sql's verified_authors comment and
-- controllers/verificationController.js for the full logic. Run the same
-- way as 002-005 — see those files for instructions.
--
--   psql "$DATABASE_URL" -f backend/migrations/006_verified_authors_owner_override.sql

ALTER TABLE verified_authors ADD COLUMN IF NOT EXISTS owner_h_index INTEGER;
ALTER TABLE verified_authors ADD COLUMN IF NOT EXISTS owner_paper_count INTEGER;
ALTER TABLE verified_authors ADD COLUMN IF NOT EXISTS owner_citation_count INTEGER;
ALTER TABLE verified_authors ADD COLUMN IF NOT EXISTS owner_confirmed_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE verified_authors ADD COLUMN IF NOT EXISTS owner_confirmed_at TIMESTAMPTZ;
