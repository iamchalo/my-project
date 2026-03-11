-- =====================================================
-- ADD MISSING COLUMNS TO shifts AND stock_counts
-- These columns are referenced in the app code but were
-- never included in a migration.
-- =====================================================

-- Add active_shift_id to shifts (links a reconciliation record
-- to the active-shift record whose chef assignments it belongs to)
ALTER TABLE shifts
  ADD COLUMN IF NOT EXISTS active_shift_id UUID REFERENCES shifts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_shifts_active_shift_id ON shifts(active_shift_id);

-- Add transfer column to stock_counts
-- (units transferred in/out during the shift)
ALTER TABLE stock_counts
  ADD COLUMN IF NOT EXISTS transfer INTEGER NOT NULL DEFAULT 0 CHECK (transfer >= 0);

-- Add started_at / ended_at to shifts if the table was created
-- from the older reconciliation-only migration (20250114) which
-- omitted these columns.  The newer migration (20250118) already
-- includes them, so ADD COLUMN IF NOT EXISTS is safe to run either way.
ALTER TABLE shifts
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS ended_at   TIMESTAMPTZ;

-- Add shift_type if missing (same situation as above)
ALTER TABLE shifts
  ADD COLUMN IF NOT EXISTS shift_type TEXT CHECK (shift_type IN ('day', 'night'));
