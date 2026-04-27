-- ============================================================
-- Migration 013: Weight bracket presets
-- Allows saving/loading custom weight bracket configurations
-- per country for reuse across rate card generation sessions.
-- ============================================================

CREATE TABLE IF NOT EXISTS weight_bracket_presets (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT NOT NULL,
  country_code TEXT NOT NULL REFERENCES countries(code) ON DELETE CASCADE,
  brackets    JSONB NOT NULL,        -- array of { range, min, max, representative }
  is_default  BOOLEAN DEFAULT false,  -- at most one default per country
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_weight_bracket_presets_country
  ON weight_bracket_presets(country_code);
