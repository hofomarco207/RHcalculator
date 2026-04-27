-- Add source and metadata columns to rate_cards for compete-based cards
ALTER TABLE rate_cards ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'scenario';
ALTER TABLE rate_cards ADD COLUMN IF NOT EXISTS metadata JSONB;
