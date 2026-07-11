-- Extends h_index_history into the researcher-level snapshot table backing
-- the Timeline feature (paper_count, source, and a once-per-day
-- snapshot_date), and adds paper_snapshots for per-paper citation history.
-- Idempotent -- safe to run multiple times.

ALTER TABLE h_index_history ADD COLUMN IF NOT EXISTS paper_count INTEGER;
ALTER TABLE h_index_history ADD COLUMN IF NOT EXISTS source VARCHAR(20);
ALTER TABLE h_index_history ADD COLUMN IF NOT EXISTS snapshot_date DATE;

UPDATE h_index_history SET snapshot_date = recorded_at::date WHERE snapshot_date IS NULL;

-- This table had no once-per-day guard before this migration, so collapse
-- any pre-existing same-day duplicates down to the latest row per day
-- before the unique index below can be created.
DELETE FROM h_index_history a
  USING h_index_history b
  WHERE a.researcher_id = b.researcher_id
    AND a.snapshot_date = b.snapshot_date
    AND a.recorded_at < b.recorded_at;

ALTER TABLE h_index_history ALTER COLUMN snapshot_date SET NOT NULL;
ALTER TABLE h_index_history ALTER COLUMN snapshot_date SET DEFAULT CURRENT_DATE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_h_index_history_researcher_snapshot_date
  ON h_index_history(researcher_id, snapshot_date);

CREATE TABLE IF NOT EXISTS paper_snapshots (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  researcher_id  UUID NOT NULL REFERENCES researchers(id) ON DELETE CASCADE,
  external_id    VARCHAR(64) NOT NULL,
  snapshot_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  citation_count INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (researcher_id, external_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_paper_snapshots_researcher_id ON paper_snapshots(researcher_id);
CREATE INDEX IF NOT EXISTS idx_paper_snapshots_researcher_date ON paper_snapshots(researcher_id, snapshot_date);
