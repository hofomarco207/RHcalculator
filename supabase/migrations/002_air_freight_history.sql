-- B段：空運報價歷史
CREATE TABLE IF NOT EXISTS air_freight_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  port_code VARCHAR(3) NOT NULL,
  cargo_type TEXT NOT NULL DEFAULT '特惠带电',
  week_label TEXT NOT NULL,
  week_start DATE,
  week_end DATE,
  raw_price_hkd_per_kg NUMERIC(10,4) NOT NULL,
  discount_hkd_per_kg NUMERIC(10,4) NOT NULL DEFAULT 0,
  net_price_hkd_per_kg NUMERIC(10,4) GENERATED ALWAYS AS (raw_price_hkd_per_kg - discount_hkd_per_kg) STORED,
  imported_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT chk_af_port CHECK (port_code IN ('LAX','JFK','ORD','DFW','MIA'))
);

CREATE INDEX IF NOT EXISTS idx_af_history_lookup
  ON air_freight_history(cargo_type, port_code, week_start DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_af_history_unique
  ON air_freight_history(port_code, cargo_type, week_label);

-- B段：匯入設定
CREATE TABLE IF NOT EXISTS air_freight_import_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  default_cargo_type TEXT NOT NULL DEFAULT '特惠带电',
  discount_hkd_per_kg NUMERIC(10,4) NOT NULL DEFAULT 1.2,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed default config
INSERT INTO air_freight_import_config (default_cargo_type, discount_hkd_per_kg)
VALUES ('特惠带电', 1.2);

-- Add carrier column to historical_shipments (for auto-computing carrier proportions)
ALTER TABLE historical_shipments ADD COLUMN IF NOT EXISTS carrier VARCHAR(10);

-- Add date range columns to import_batches
ALTER TABLE import_batches ADD COLUMN IF NOT EXISTS date_start DATE;
ALTER TABLE import_batches ADD COLUMN IF NOT EXISTS date_end DATE;
