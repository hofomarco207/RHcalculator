-- Add TWD/HKD exchange rate
ALTER TABLE exchange_rates
  ADD COLUMN IF NOT EXISTS twd_hkd numeric(10,6) DEFAULT 0.2440;

-- Add fuel surcharge percentage to BC rates
-- Formula: BC cost = rate_per_kg × weight × (1 + fuel_surcharge_pct / 100)
ALTER TABLE vendor_bc_rates
  ADD COLUMN IF NOT EXISTS fuel_surcharge_pct numeric(6,4) NOT NULL DEFAULT 0;

-- Add per_kg_currency to A-segment rates (default TWD — Taiwan origin)
ALTER TABLE vendor_a_rates
  ADD COLUMN IF NOT EXISTS per_kg_currency text NOT NULL DEFAULT 'TWD';
