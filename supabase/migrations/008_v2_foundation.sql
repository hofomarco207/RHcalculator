-- v2 Foundation: A段 vendor support, D段 vendor-scoped rates, scenario-linked rate cards

-- 1. Widen vendor segment to include 'A'
ALTER TABLE vendors DROP CONSTRAINT IF EXISTS vendors_segment_check;
ALTER TABLE vendors ADD CONSTRAINT vendors_segment_check
  CHECK (segment IN ('A', 'B', 'C', 'D'));

-- 2. A段 vendor rates table
CREATE TABLE IF NOT EXISTS vendor_a_rates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  pickup_hkd_per_kg NUMERIC(10,4) NOT NULL DEFAULT 0,
  sorting_hkd_per_kg NUMERIC(10,4) NOT NULL DEFAULT 0,
  include_sorting BOOLEAN DEFAULT false,
  notes TEXT,
  is_current BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_va_vendor ON vendor_a_rates(vendor_id);

-- 3. D段: Add vendor_id to last_mile_rates
ALTER TABLE last_mile_rates ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES vendors(id);

-- Backfill: assign existing rates to WT vendor
UPDATE last_mile_rates SET vendor_id = (
  SELECT id FROM vendors WHERE name = 'WT' AND segment = 'D' LIMIT 1
) WHERE vendor_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_lmr_vendor ON last_mile_rates(vendor_id);

-- 4. Scenario: add vendor_a_id
ALTER TABLE scenarios ADD COLUMN IF NOT EXISTS vendor_a_id UUID REFERENCES vendors(id);

-- 5. Rate cards: add scenario_id + country_code
ALTER TABLE rate_cards ADD COLUMN IF NOT EXISTS scenario_id UUID REFERENCES scenarios(id);
ALTER TABLE rate_cards ADD COLUMN IF NOT EXISTS country_code VARCHAR(3) REFERENCES countries(code) DEFAULT 'US';

-- 6. Vendors: add flexible config JSONB
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS config JSONB;

-- 7. Seed default A段 vendor for US
INSERT INTO vendors (name, segment, country_code, notes) VALUES
  ('iMile HK Pickup', 'A', 'US', '預設攬收服務');
