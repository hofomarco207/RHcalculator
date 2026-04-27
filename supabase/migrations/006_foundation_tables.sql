-- Phase 1: Foundation tables for vendor-based scenario optimizer
-- Countries, Gateways, Carriers, Vendors (all DB-driven, multi-country extensible)

-- ─── Countries ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS countries (
  code VARCHAR(3) PRIMARY KEY,
  name_zh TEXT NOT NULL,
  name_en TEXT,
  currency_code VARCHAR(3) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO countries (code, name_zh, name_en, currency_code) VALUES
  ('US', '美國', 'United States', 'USD')
ON CONFLICT (code) DO NOTHING;

-- ─── Gateways (replaces hardcoded GatewayCode) ─────────────────────────────
CREATE TABLE IF NOT EXISTS gateways (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code VARCHAR(5) NOT NULL,
  country_code VARCHAR(3) NOT NULL REFERENCES countries(code),
  name_zh TEXT,
  name_en TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(code, country_code)
);

INSERT INTO gateways (code, country_code, name_zh, name_en) VALUES
  ('LAX', 'US', '洛杉磯', 'Los Angeles'),
  ('JFK', 'US', '紐約',   'New York'),
  ('ORD', 'US', '芝加哥', 'Chicago'),
  ('DFW', 'US', '達拉斯', 'Dallas'),
  ('MIA', 'US', '邁阿密', 'Miami')
ON CONFLICT (code, country_code) DO NOTHING;

-- ─── Carriers (replaces hardcoded CarrierName) ──────────────────────────────
CREATE TABLE IF NOT EXISTS carriers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code VARCHAR(10) NOT NULL,
  country_code VARCHAR(3) NOT NULL REFERENCES countries(code),
  name TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(code, country_code)
);

INSERT INTO carriers (code, country_code, name) VALUES
  ('GOFO', 'US', 'GOFO'),
  ('OSM',  'US', 'OSM'),
  ('USPS', 'US', 'USPS'),
  ('UNI',  'US', 'UniUni')
ON CONFLICT (code, country_code) DO NOTHING;

-- ─── Vendors ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendors (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  segment VARCHAR(1) NOT NULL CHECK (segment IN ('B', 'C', 'D')),
  country_code VARCHAR(3) NOT NULL REFERENCES countries(code),
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed: WT as the existing D段 vendor
INSERT INTO vendors (name, segment, country_code, notes) VALUES
  ('WT', 'D', 'US', '現有尾程服務商，提供 GOFO/USPS/UNI/OSM 費率');

-- ─── Vendor B段 rates (volume-tiered, per gateway) ──────────────────────────
CREATE TABLE IF NOT EXISTS vendor_b_rates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  gateway_code VARCHAR(5) NOT NULL,
  airline VARCHAR(10),
  weight_tier_min_kg NUMERIC NOT NULL,
  rate_per_kg NUMERIC(10,4) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'RMB',
  bubble_ratio NUMERIC(6,4) DEFAULT 1.0,
  transit_days TEXT,
  frequency TEXT,
  flights_per_week INT,
  -- Per-MAWB fixed fees (in vendor's currency)
  pickup_fee NUMERIC(10,2) DEFAULT 0,
  handling_fee NUMERIC(10,2) DEFAULT 0,
  operation_fee NUMERIC(10,2) DEFAULT 0,
  document_fee NUMERIC(10,2) DEFAULT 0,
  battery_check_fee NUMERIC(10,2) DEFAULT 0,
  customs_fee NUMERIC(10,2) DEFAULT 0,
  notes TEXT,
  is_current BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vb_vendor_gw ON vendor_b_rates(vendor_id, gateway_code);

-- ─── Vendor C段 rates (structured fee model) ────────────────────────────────
CREATE TABLE IF NOT EXISTS vendor_c_rates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  fee_type TEXT NOT NULL CHECK (fee_type IN ('per_mawb', 'per_kg', 'per_hawb')),
  fee_name TEXT NOT NULL,
  gateway_code VARCHAR(5),
  amount NUMERIC(10,4) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  min_amount NUMERIC(10,2),
  notes TEXT,
  is_current BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vc_vendor ON vendor_c_rates(vendor_id);

-- ─── Vendor D段 config (links vendor to carriers) ───────────────────────────
CREATE TABLE IF NOT EXISTS vendor_d_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  carrier_code VARCHAR(10) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(vendor_id, carrier_code)
);

-- Link WT vendor to all 4 carriers
INSERT INTO vendor_d_config (vendor_id, carrier_code)
SELECT v.id, c.code
FROM vendors v, (VALUES ('GOFO'), ('OSM'), ('USPS'), ('UNI')) AS c(code)
WHERE v.name = 'WT' AND v.segment = 'D'
ON CONFLICT (vendor_id, carrier_code) DO NOTHING;

-- ─── Scenarios ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scenarios (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  country_code VARCHAR(3) NOT NULL DEFAULT 'US' REFERENCES countries(code),
  weekly_tickets INT,
  zip_source TEXT DEFAULT 'historical',
  -- A段
  seg_a JSONB,
  -- B段
  vendor_b_id UUID REFERENCES vendors(id),
  b_gateway_mode TEXT DEFAULT 'optimized',
  b_single_gateway VARCHAR(5),
  b_manual_proportions JSONB,
  b_bubble_rate NUMERIC(6,4) DEFAULT 1.1,
  -- C段
  vendor_c_id UUID REFERENCES vendors(id),
  c_overrides JSONB,
  -- D段
  vendor_d_id UUID REFERENCES vendors(id),
  d_carrier_proportions JSONB,
  -- Exchange rates snapshot
  exchange_rates JSONB,
  -- Cached results
  results JSONB,
  -- Meta
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scenarios_country ON scenarios(country_code);
