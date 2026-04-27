-- 010: 簡易費率 + 一口價定價模式
-- 1. C/D段支援簡易費率（沿用 vendor.config JSONB）
-- 2. 國家級「一口價」模式：A段 + BCD合併定價

-- ─── 1. 國家定價模式 ────────────────────────────────────────────────────────
ALTER TABLE countries ADD COLUMN IF NOT EXISTS pricing_mode TEXT NOT NULL DEFAULT 'segmented';
-- Add check constraint (DROP first in case of re-run)
DO $$ BEGIN
  ALTER TABLE countries ADD CONSTRAINT countries_pricing_mode_check
    CHECK (pricing_mode IN ('segmented', 'all_in_one'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── 2. Vendor segment 加 'BCD' ─────────────────────────────────────────────
ALTER TABLE vendors DROP CONSTRAINT IF EXISTS vendors_segment_check;
ALTER TABLE vendors ADD CONSTRAINT vendors_segment_check
  CHECK (segment IN ('A', 'B', 'C', 'D', 'BCD'));

-- ─── 3. BCD 一口價費率表 ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendor_bcd_rates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  rate_per_kg NUMERIC(10,4) NOT NULL,
  handling_fee_per_unit NUMERIC(10,4) NOT NULL DEFAULT 0,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  notes TEXT,
  is_current BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vbcd_vendor ON vendor_bcd_rates(vendor_id);

-- ─── 4. Scenario 加 BCD 支援 ────────────────────────────────────────────────
ALTER TABLE scenarios ADD COLUMN IF NOT EXISTS vendor_bcd_id UUID REFERENCES vendors(id);
ALTER TABLE scenarios ADD COLUMN IF NOT EXISTS pricing_mode TEXT DEFAULT 'segmented';
