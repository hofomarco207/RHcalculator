-- ============================================================
-- RH Calculator — Initial Schema  (2026-04-27)
-- Clean consolidation for the RH fork.
-- Drops all iMile-only concepts (B段, C段, BCD, zone-based US,
-- countries/gateways/carriers tables).
-- ============================================================

-- ─── Extensions ──────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Utility trigger: valid_to ↔ is_current sync ─────────────────────────────
CREATE OR REPLACE FUNCTION sync_is_current_from_valid_to()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.valid_to IS NOT NULL AND (OLD.valid_to IS NULL OR OLD.valid_to IS DISTINCT FROM NEW.valid_to) THEN
    NEW.is_current := false;
  ELSIF NEW.valid_to IS NULL AND OLD.valid_to IS NOT NULL THEN
    NEW.is_current := true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── Exchange Rates ───────────────────────────────────────────────────────────
CREATE TABLE exchange_rates (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  usd_hkd    numeric(10,4) NOT NULL DEFAULT 7.8,
  rmb_hkd    numeric(10,4) NOT NULL DEFAULT 1.08,
  jpy_hkd    numeric(10,6) NOT NULL DEFAULT 0.052,
  eur_hkd    numeric(10,4) NOT NULL DEFAULT 8.5,
  gbp_hkd    numeric(10,4) NOT NULL DEFAULT 10.0,
  updated_at timestamptz  NOT NULL DEFAULT now()
);

INSERT INTO exchange_rates (usd_hkd, rmb_hkd, jpy_hkd, eur_hkd, gbp_hkd)
VALUES (7.8, 1.08, 0.052, 8.5, 10.0);

-- ─── Vendors ──────────────────────────────────────────────────────────────────
-- RH segments: A (warehouse/pickup), BC (air + clearance combined), D (last-mile)
CREATE TABLE vendors (
  id                 uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  name               text    NOT NULL,
  segment            text    NOT NULL CHECK (segment IN ('A', 'BC', 'D')),
  notes              text,
  config             jsonb,
  per_piece_fee      numeric(10,4) DEFAULT 0,
  per_piece_currency text          DEFAULT 'HKD',
  a_pricing_mode     text          DEFAULT 'per_kg',   -- A段: 'per_kg' | 'per_piece'
  is_active          boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- ─── Vendor A段 rates ─────────────────────────────────────────────────────────
-- Formula: A_cost = (pickup_hkd_per_kg + sorting?) × weight × bubble_ratio
--          + per_piece_fee per ticket
CREATE TABLE vendor_a_rates (
  id                  uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id           uuid    NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  pickup_hkd_per_kg   numeric(10,4) NOT NULL DEFAULT 0,
  sorting_hkd_per_kg  numeric(10,4) NOT NULL DEFAULT 0,
  include_sorting     boolean DEFAULT false,
  bubble_ratio        numeric(6,4)  NOT NULL DEFAULT 1.0,
  notes               text,
  version             integer NOT NULL DEFAULT 1,
  valid_from          date,
  valid_to            date,
  source              text,
  source_file         text,
  is_current          boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_vendor_a_rates_vendor ON vendor_a_rates(vendor_id);
CREATE INDEX idx_vendor_a_rates_active ON vendor_a_rates(vendor_id) WHERE valid_to IS NULL;

CREATE TRIGGER trg_sync_is_current BEFORE UPDATE ON vendor_a_rates
  FOR EACH ROW EXECUTE FUNCTION sync_is_current_from_valid_to();

-- ─── Vendor BC段 rates ────────────────────────────────────────────────────────
-- Formula: BC_cost = rate_per_kg × weight × bc_bubble_ratio + handling_fee
CREATE TABLE vendor_bc_rates (
  id            uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id     uuid    NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  rate_per_kg   numeric(10,4) NOT NULL,
  handling_fee  numeric(10,4) NOT NULL DEFAULT 0,  -- per ticket
  currency      text NOT NULL DEFAULT 'HKD',
  service_name  text,
  notes         text,
  version       integer NOT NULL DEFAULT 1,
  valid_from    date,
  valid_to      date,
  source        text,
  source_file   text,
  is_current    boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_vendor_bc_rates_vendor ON vendor_bc_rates(vendor_id);
CREATE INDEX idx_vendor_bc_rates_active ON vendor_bc_rates(vendor_id) WHERE valid_to IS NULL;

CREATE TRIGGER trg_sync_is_current BEFORE UPDATE ON vendor_bc_rates
  FOR EACH ROW EXECUTE FUNCTION sync_is_current_from_valid_to();

-- ─── Vendor D段: first_additional (simple per-country first+additional weight) ─
CREATE TABLE vendor_d_rates (
  id                      uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id               uuid    NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  country_code            text    NOT NULL,
  country_name            text,
  first_weight_kg         numeric(10,4) NOT NULL DEFAULT 1.0,
  first_weight_price      numeric(10,4) NOT NULL,
  additional_weight_kg    numeric(10,4) NOT NULL DEFAULT 1.0,
  additional_weight_price numeric(10,4) NOT NULL,
  currency                text NOT NULL DEFAULT 'HKD',
  max_weight_kg           numeric(10,4),
  notes                   text,
  version                 integer NOT NULL DEFAULT 1,
  valid_from              date,
  valid_to                date,
  source                  text,
  source_file             text,
  is_current              boolean NOT NULL DEFAULT true,
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_vendor_d_rates_vendor ON vendor_d_rates(vendor_id, country_code);
CREATE INDEX idx_vendor_d_rates_active ON vendor_d_rates(vendor_id) WHERE valid_to IS NULL;

CREATE TRIGGER trg_sync_is_current BEFORE UPDATE ON vendor_d_rates
  FOR EACH ROW EXECUTE FUNCTION sync_is_current_from_valid_to();

-- ─── Vendor D段: tiered_per_kg (per-country × weight-bracket → rate/kg + reg_fee)
CREATE TABLE vendor_d_tiered_rates (
  id                       uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id                uuid    NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  country_code             text    NOT NULL,
  country_name             text,
  weight_min_kg            numeric(10,4) NOT NULL,
  weight_max_kg            numeric(10,4) NOT NULL,
  rate_per_kg              numeric(10,4) NOT NULL,
  registration_fee         numeric(10,4) NOT NULL DEFAULT 0,
  currency                 text NOT NULL DEFAULT 'HKD',
  min_chargeable_weight_kg numeric(10,4),
  transit_days             text,
  version                  integer NOT NULL DEFAULT 1,
  valid_from               date,
  valid_to                 date,
  source                   text,
  source_file              text,
  is_current               boolean NOT NULL DEFAULT true,
  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_vendor_d_tiered_vendor ON vendor_d_tiered_rates(vendor_id, country_code);
CREATE INDEX idx_vendor_d_tiered_active ON vendor_d_tiered_rates(vendor_id) WHERE valid_to IS NULL;

CREATE TRIGGER trg_sync_is_current BEFORE UPDATE ON vendor_d_tiered_rates
  FOR EACH ROW EXECUTE FUNCTION sync_is_current_from_valid_to();

-- ─── Vendor D段: lookup_table (area × weight-point → absolute amount) ─────────
-- ECMS/郵政-style: country mapped to an area; price looked up from a weight table
CREATE TABLE vendor_d_lookup_rates (
  id          uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id   uuid    NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  area_code   text    NOT NULL,
  area_name   text,
  weight_kg   numeric(10,4) NOT NULL,
  amount      numeric(10,4) NOT NULL,
  currency    text NOT NULL DEFAULT 'JPY',
  version     integer NOT NULL DEFAULT 1,
  valid_from  date,
  valid_to    date,
  source      text,
  source_file text,
  is_current  boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_vendor_d_lookup_vendor ON vendor_d_lookup_rates(vendor_id, area_code);
CREATE INDEX idx_vendor_d_lookup_active ON vendor_d_lookup_rates(vendor_id) WHERE valid_to IS NULL;

CREATE TRIGGER trg_sync_is_current BEFORE UPDATE ON vendor_d_lookup_rates
  FOR EACH ROW EXECUTE FUNCTION sync_is_current_from_valid_to();

-- ─── Vendor D段: area → country mapping (for lookup_table model) ──────────────
CREATE TABLE vendor_d_lookup_area_countries (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id    uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  area_code    text NOT NULL,
  country_code text NOT NULL,
  UNIQUE(vendor_id, country_code)
);

CREATE INDEX idx_vendor_d_lookup_area_vendor
  ON vendor_d_lookup_area_countries(vendor_id, area_code);

-- ─── Scenarios ────────────────────────────────────────────────────────────────
-- RH: always global (no country_code), always bc_combined pricing mode
CREATE TABLE scenarios (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 text NOT NULL,
  -- A段
  vendor_a_id          uuid REFERENCES vendors(id),
  seg_a                jsonb,               -- A段 overrides / extra config
  -- BC段 (air + clearance combined)
  vendor_bc_id         uuid REFERENCES vendors(id),
  bc_bubble_ratio      numeric(6,4) NOT NULL DEFAULT 1.0,
  -- D段 (last-mile)
  vendor_d_id          uuid REFERENCES vendors(id),
  d_pricing_model      text DEFAULT 'tiered_per_kg',
  -- tiered_per_kg | lookup_table | first_additional | per_piece
  d_carrier_proportions jsonb,
  -- Operational
  origin_warehouse     text DEFAULT 'HK',
  weekly_tickets       int,
  -- Snapshot at calculation time
  exchange_rates       jsonb,
  -- Cached cost results: {country_code: {weights: [{weight, cost_hkd}]}}
  results              jsonb,
  pricing_mode         text NOT NULL DEFAULT 'bc_combined',
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- ─── Rate Cards (global: one card = all countries) ────────────────────────────
CREATE TABLE rate_cards (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_code        text NOT NULL,
  product_name        text NOT NULL,
  scenario_id         uuid REFERENCES scenarios(id),
  source              text NOT NULL DEFAULT 'scenario',  -- 'scenario' | 'manual'
  currency            text NOT NULL DEFAULT 'HKD',
  fuel_surcharge_pct  numeric NOT NULL DEFAULT 0,
  weight_step         numeric NOT NULL DEFAULT 0,  -- 0 = linear; 0.5 = 0.5kg steps
  -- Versioning
  version             int  NOT NULL DEFAULT 1,
  valid_from          date NOT NULL DEFAULT CURRENT_DATE,
  valid_to            date,
  is_current          boolean NOT NULL DEFAULT true,
  -- Soft delete
  deleted_at          timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rate_cards_version_key UNIQUE (product_code, version)
);

CREATE INDEX idx_rate_cards_current
  ON rate_cards(product_code) WHERE is_current = true AND deleted_at IS NULL;

CREATE TRIGGER trg_sync_is_current BEFORE UPDATE ON rate_cards
  FOR EACH ROW EXECUTE FUNCTION sync_is_current_from_valid_to();

-- ─── Rate Card Country Brackets ───────────────────────────────────────────────
-- One row per country per rate card.
-- brackets format (JSONB array):
--   [{weight_min, weight_max, rate_per_kg, reg_fee, cost_hkd}]
-- cost_hkd is admin-only; the public API must NEVER return it.
CREATE TABLE rate_card_country_brackets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_card_id    uuid NOT NULL REFERENCES rate_cards(id) ON DELETE CASCADE,
  country_code    text NOT NULL,
  country_name_en text NOT NULL,
  country_name_zh text,
  brackets        jsonb NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rate_card_country_unique UNIQUE (rate_card_id, country_code)
);

CREATE INDEX idx_rccb_rate_card ON rate_card_country_brackets(rate_card_id);
CREATE INDEX idx_rccb_country    ON rate_card_country_brackets(country_code);

-- ─── Competitor Rate Cards ────────────────────────────────────────────────────
-- Full versioned competitor pricing (Yuntu / ECMS etc.)
-- brackets format: [{weight_range, weight_min, weight_max, rate_per_kg, reg_fee}]
CREATE TABLE competitor_rate_cards (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_name text NOT NULL,
  service_code    text NOT NULL,
  country_name_en text NOT NULL,
  country_name_zh text NOT NULL,
  country_code    text,             -- nullable: unknown/unmapped countries
  brackets        jsonb NOT NULL,
  pricing_formula text NOT NULL DEFAULT 'per_kg_plus_reg',
  currency        text NOT NULL DEFAULT 'HKD',
  fuel_surcharge_pct numeric NOT NULL DEFAULT 0,
  weight_step     numeric NOT NULL DEFAULT 0,
  effective_date  date,
  -- Versioning
  version         int  NOT NULL DEFAULT 1,
  valid_from      date,
  valid_to        date,
  is_current      boolean NOT NULL DEFAULT true,
  source_file     text,
  vendor_label    text,             -- display name set by user at import time
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_crc_country   ON competitor_rate_cards(country_code);
CREATE INDEX idx_crc_competitor ON competitor_rate_cards(competitor_name, service_code);
CREATE INDEX idx_crc_active    ON competitor_rate_cards(competitor_name, service_code, country_code)
  WHERE valid_to IS NULL;
CREATE INDEX idx_crc_versions  ON competitor_rate_cards(competitor_name, service_code, country_code, version);

CREATE TRIGGER trg_sync_is_current BEFORE UPDATE ON competitor_rate_cards
  FOR EACH ROW EXECUTE FUNCTION sync_is_current_from_valid_to();

-- ─── Weight Break Datasets ────────────────────────────────────────────────────
CREATE TABLE weight_break_datasets (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label        text NOT NULL,
  country_code text,             -- optional filter (NULL = global/all)
  period       text,
  total_orders integer,
  created_at   timestamptz DEFAULT now()
);

CREATE TABLE weight_break_entries (
  id           uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id   uuid    NOT NULL REFERENCES weight_break_datasets(id) ON DELETE CASCADE,
  weight_kg    numeric NOT NULL,
  order_count  integer NOT NULL,
  total_weight numeric GENERATED ALWAYS AS (weight_kg * order_count) STORED
);

CREATE INDEX idx_wbe_dataset ON weight_break_entries(dataset_id);

-- ─── Customers ────────────────────────────────────────────────────────────────
CREATE TABLE customers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  contact_email text,
  contact_phone text,
  notes         text,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ─── Historical Shipments ─────────────────────────────────────────────────────
CREATE TABLE historical_shipments (
  id              uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id     uuid    REFERENCES customers(id),
  ship_date       date,
  country_code    text    NOT NULL,
  zip_code        text,
  weight_kg       numeric(10,4) NOT NULL,
  actual_cost_hkd numeric(10,4),   -- actual landed cost (admin-only)
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_hs_customer  ON historical_shipments(customer_id);
CREATE INDEX idx_hs_country   ON historical_shipments(country_code);
CREATE INDEX idx_hs_ship_date ON historical_shipments(ship_date);
