-- Add fuel surcharge percentage to competitor rate cards
-- This allows storing base rates (Sell/WtoD) and applying FSC separately
ALTER TABLE competitor_rate_cards
  ADD COLUMN fuel_surcharge_pct numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN competitor_rate_cards.fuel_surcharge_pct IS 'Fuel surcharge percentage (e.g. 19 means 19%). Applied to freight portion only during compete analysis.';
