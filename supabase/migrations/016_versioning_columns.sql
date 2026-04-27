-- ============================================================
-- Migration 016: 版本化欄位 — 所有費率表加版本追蹤
-- ============================================================
-- 新增 version / valid_from / valid_to / source / source_file
-- 保留 is_current 欄位 + trigger 同步，向後兼容

-- ─── vendor_a_rates ─────────────────────────────────────────────────────────
ALTER TABLE vendor_a_rates ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
ALTER TABLE vendor_a_rates ADD COLUMN IF NOT EXISTS valid_from DATE;
ALTER TABLE vendor_a_rates ADD COLUMN IF NOT EXISTS valid_to DATE;
ALTER TABLE vendor_a_rates ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE vendor_a_rates ADD COLUMN IF NOT EXISTS source_file TEXT;

-- ─── vendor_b_rates ─────────────────────────────────────────────────────────
ALTER TABLE vendor_b_rates ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
ALTER TABLE vendor_b_rates ADD COLUMN IF NOT EXISTS valid_from DATE;
ALTER TABLE vendor_b_rates ADD COLUMN IF NOT EXISTS valid_to DATE;
ALTER TABLE vendor_b_rates ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE vendor_b_rates ADD COLUMN IF NOT EXISTS source_file TEXT;

-- ─── vendor_c_rates ─────────────────────────────────────────────────────────
ALTER TABLE vendor_c_rates ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
ALTER TABLE vendor_c_rates ADD COLUMN IF NOT EXISTS valid_from DATE;
ALTER TABLE vendor_c_rates ADD COLUMN IF NOT EXISTS valid_to DATE;
ALTER TABLE vendor_c_rates ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE vendor_c_rates ADD COLUMN IF NOT EXISTS source_file TEXT;

-- ─── vendor_d_rates ─────────────────────────────────────────────────────────
ALTER TABLE vendor_d_rates ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
ALTER TABLE vendor_d_rates ADD COLUMN IF NOT EXISTS valid_from DATE;
ALTER TABLE vendor_d_rates ADD COLUMN IF NOT EXISTS valid_to DATE;
ALTER TABLE vendor_d_rates ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE vendor_d_rates ADD COLUMN IF NOT EXISTS source_file TEXT;

-- ─── vendor_bc_rates ────────────────────────────────────────────────────────
ALTER TABLE vendor_bc_rates ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
ALTER TABLE vendor_bc_rates ADD COLUMN IF NOT EXISTS valid_from DATE;
ALTER TABLE vendor_bc_rates ADD COLUMN IF NOT EXISTS valid_to DATE;
ALTER TABLE vendor_bc_rates ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE vendor_bc_rates ADD COLUMN IF NOT EXISTS source_file TEXT;

-- ─── vendor_d_config ────────────────────────────────────────────────────────
ALTER TABLE vendor_d_config ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
ALTER TABLE vendor_d_config ADD COLUMN IF NOT EXISTS valid_from DATE;
ALTER TABLE vendor_d_config ADD COLUMN IF NOT EXISTS valid_to DATE;
ALTER TABLE vendor_d_config ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE vendor_d_config ADD COLUMN IF NOT EXISTS source_file TEXT;

-- ─── Backfill existing records ──────────────────────────────────────────────
UPDATE vendor_a_rates SET valid_from = created_at::date, version = 1 WHERE version IS NULL OR valid_from IS NULL;
UPDATE vendor_b_rates SET valid_from = created_at::date, version = 1 WHERE version IS NULL OR valid_from IS NULL;
UPDATE vendor_c_rates SET valid_from = created_at::date, version = 1 WHERE version IS NULL OR valid_from IS NULL;
UPDATE vendor_d_rates SET valid_from = created_at::date, version = 1 WHERE version IS NULL OR valid_from IS NULL;
UPDATE vendor_bc_rates SET valid_from = created_at::date, version = 1 WHERE version IS NULL OR valid_from IS NULL;
UPDATE vendor_d_config SET valid_from = created_at::date, version = 1 WHERE version IS NULL OR valid_from IS NULL;

-- ─── Partial indexes for active records (valid_to IS NULL) ──────────────────
CREATE INDEX IF NOT EXISTS idx_vendor_a_rates_active ON vendor_a_rates(vendor_id) WHERE valid_to IS NULL;
CREATE INDEX IF NOT EXISTS idx_vendor_b_rates_active ON vendor_b_rates(vendor_id) WHERE valid_to IS NULL;
CREATE INDEX IF NOT EXISTS idx_vendor_c_rates_active ON vendor_c_rates(vendor_id) WHERE valid_to IS NULL;
CREATE INDEX IF NOT EXISTS idx_vendor_d_rates_active ON vendor_d_rates(vendor_id) WHERE valid_to IS NULL;
CREATE INDEX IF NOT EXISTS idx_vendor_bc_rates_active ON vendor_bc_rates(vendor_id) WHERE valid_to IS NULL;
CREATE INDEX IF NOT EXISTS idx_vendor_d_config_active ON vendor_d_config(vendor_id) WHERE valid_to IS NULL;

-- ─── Sync trigger: valid_to ↔ is_current ────────────────────────────────────
-- When valid_to is set to non-NULL → also set is_current = false
-- When valid_to is set to NULL → also set is_current = true

CREATE OR REPLACE FUNCTION sync_is_current_from_valid_to()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.valid_to IS NOT NULL AND (OLD.valid_to IS NULL OR OLD.valid_to IS DISTINCT FROM NEW.valid_to) THEN
    NEW.is_current := false;
  ELSIF NEW.valid_to IS NULL AND OLD.valid_to IS NOT NULL THEN
    NEW.is_current := true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all rate tables that have is_current
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'vendor_a_rates', 'vendor_b_rates', 'vendor_c_rates',
    'vendor_d_rates', 'vendor_bc_rates'
  ]) LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_sync_is_current ON %I;
       CREATE TRIGGER trg_sync_is_current
       BEFORE UPDATE ON %I
       FOR EACH ROW EXECUTE FUNCTION sync_is_current_from_valid_to()',
      tbl, tbl
    );
  END LOOP;
END $$;
