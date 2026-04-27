-- ============================================================
-- Migration 011: BCD → BC + D段首重/續重費率表
-- ============================================================

-- 1. Drop old check constraint, update data, add new constraint
ALTER TABLE vendors DROP CONSTRAINT IF EXISTS vendors_segment_check;
UPDATE vendors SET segment = 'BC' WHERE segment = 'BCD';
ALTER TABLE vendors ADD CONSTRAINT vendors_segment_check CHECK (segment IN ('A', 'B', 'C', 'D', 'BC'));

-- 2. Rename vendor_bcd_rates → vendor_bc_rates
ALTER TABLE IF EXISTS vendor_bcd_rates RENAME TO vendor_bc_rates;

-- 3. Country pricing_mode: drop old constraint, update, add new
ALTER TABLE countries DROP CONSTRAINT IF EXISTS countries_pricing_mode_check;
UPDATE countries SET pricing_mode = 'bc_combined' WHERE pricing_mode = 'all_in_one';
ALTER TABLE countries ADD CONSTRAINT countries_pricing_mode_check CHECK (pricing_mode IN ('segmented', 'bc_combined'));

-- 4. Scenario: rename column + update pricing_mode
ALTER TABLE scenarios RENAME COLUMN vendor_bcd_id TO vendor_bc_id;
UPDATE scenarios SET pricing_mode = 'bc_combined' WHERE pricing_mode = 'all_in_one';

-- 5. Add d_pricing_model column to scenarios
ALTER TABLE scenarios ADD COLUMN IF NOT EXISTS d_pricing_model TEXT DEFAULT 'zone_based';

-- 6. New table: D段首重/續重費率
CREATE TABLE IF NOT EXISTS vendor_d_rates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  zone TEXT,
  first_weight_kg NUMERIC(10,4) NOT NULL DEFAULT 1.0,
  first_weight_price NUMERIC(10,4) NOT NULL,
  additional_weight_kg NUMERIC(10,4) NOT NULL DEFAULT 1.0,
  additional_weight_price NUMERIC(10,4) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  max_weight_kg NUMERIC(10,4),
  notes TEXT,
  is_current BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendor_d_rates_vendor ON vendor_d_rates(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_d_rates_current ON vendor_d_rates(vendor_id, is_current);
