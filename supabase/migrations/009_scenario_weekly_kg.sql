-- Add weekly_kg to scenarios for precise average weight calculation
ALTER TABLE scenarios ADD COLUMN IF NOT EXISTS weekly_kg NUMERIC(10,2);
