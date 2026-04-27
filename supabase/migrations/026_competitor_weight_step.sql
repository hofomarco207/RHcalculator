-- Add weight_step to competitor_rate_cards for carriers like ECMS
-- that charge in fixed weight increments (e.g. 0.5kg steps).
-- weight_step = 0 means continuous pricing (no rounding).
-- weight_step = 0.5 means weight is rounded up to nearest 0.5kg.
ALTER TABLE competitor_rate_cards
  ADD COLUMN weight_step numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN competitor_rate_cards.weight_step IS 'Weight rounding step in kg. 0 = continuous (per-kg pricing). 0.5 = round up to nearest 0.5kg (ECMS-style).';
