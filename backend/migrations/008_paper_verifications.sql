-- Adds the paper_verifications table for per-paper "this is mine / not mine
-- / duplicate" corrections. Idempotent -- safe to run multiple times.

CREATE TABLE IF NOT EXISTS paper_verifications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  researcher_id UUID NOT NULL REFERENCES researchers(id) ON DELETE CASCADE,
  external_id   VARCHAR(64) NOT NULL,
  status        VARCHAR(20) NOT NULL CHECK (status IN ('confirmed', 'not_mine', 'duplicate')),
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (researcher_id, external_id)
);

CREATE INDEX IF NOT EXISTS idx_paper_verifications_researcher_id ON paper_verifications(researcher_id);
