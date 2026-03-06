-- =====================================================
-- Add transfer + sales_qty columns to stock_counts
-- Add active_shift_id to reconciliation rows in shifts
-- =====================================================

-- transfer: products moved to another branch during the shift
ALTER TABLE stock_counts
  ADD COLUMN IF NOT EXISTS transfer  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sales_qty INTEGER NOT NULL DEFAULT 0;

-- active_shift_id: links a reconciliation row (is_active=false) to the
-- corresponding active shift (is_active=true) so admin can look up chefs
ALTER TABLE shifts
  ADD COLUMN IF NOT EXISTS active_shift_id UUID REFERENCES shifts(id) ON DELETE SET NULL;
