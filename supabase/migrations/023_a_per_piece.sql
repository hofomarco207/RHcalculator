-- Migration 023: A段 per_piece pricing mode + JPY exchange rate
-- Background: JP warehouse charges 120 JPY/piece (fixed, not weight-based),
-- different from existing HK warehouse per_kg model.

-- vendors table: add A段 pricing mode columns
ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS a_pricing_mode text NOT NULL DEFAULT 'per_kg'
    CHECK (a_pricing_mode IN ('per_kg', 'per_piece')),
  ADD COLUMN IF NOT EXISTS per_piece_fee numeric,
  ADD COLUMN IF NOT EXISTS per_piece_currency text;

-- Add JPY→HKD exchange rate column (0.052 is approximate, Marco will adjust)
ALTER TABLE exchange_rates
  ADD COLUMN IF NOT EXISTS jpy_hkd numeric DEFAULT 0.052;
