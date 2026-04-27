-- Competitor rate cards (e.g. Yuntu pricing)
-- Each row = one competitor × one country × one service
-- brackets JSONB: [{weight_range, weight_min, weight_max, rate_per_kg, reg_fee}]
-- pricing_formula: 'per_kg_plus_reg' means total = rate_per_kg × weight + reg_fee

CREATE TABLE IF NOT EXISTS competitor_rate_cards (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  competitor_name TEXT NOT NULL,
  service_code TEXT NOT NULL,
  country_name_en TEXT NOT NULL,
  country_name_zh TEXT NOT NULL,
  country_code TEXT REFERENCES countries(code) ON DELETE SET NULL,
  brackets JSONB NOT NULL,
  pricing_formula TEXT NOT NULL DEFAULT 'per_kg_plus_reg',
  currency TEXT NOT NULL DEFAULT 'HKD',
  effective_date DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_competitor_rate_cards_country
  ON competitor_rate_cards(country_code);
CREATE INDEX IF NOT EXISTS idx_competitor_rate_cards_competitor
  ON competitor_rate_cards(competitor_name, service_code);
