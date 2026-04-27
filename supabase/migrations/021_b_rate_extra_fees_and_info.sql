-- 021: Add airport_transfer_fee, magnetic_check_fee, and reference info fields to vendor_b_rates
-- airport_transfer_fee: 機場接駁費 (per MAWB)
-- magnetic_check_fee: 磁檢費 (per MAWB)
-- routing: 路由 (e.g. HKG-ICN-LAX)
-- service_type: 服務類型 (門到港/港到港)

ALTER TABLE vendor_b_rates
  ADD COLUMN IF NOT EXISTS airport_transfer_fee NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS magnetic_check_fee NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS routing TEXT,
  ADD COLUMN IF NOT EXISTS service_type TEXT;

-- Also add flights_per_week to scenarios for scenario-level override
ALTER TABLE scenarios
  ADD COLUMN IF NOT EXISTS flights_per_week INTEGER;
