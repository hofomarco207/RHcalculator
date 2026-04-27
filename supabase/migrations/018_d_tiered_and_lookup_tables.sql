-- ============================================================
-- Migration 018: D段新定價模型表 — D-5 tiered_per_kg + D-6 lookup_table
-- ============================================================

-- ─── D-5: vendor_d_tiered_rates ─────────────────────────────────────────────
-- 雲途型：分國家 × 分重量段 × per_kg rate + per_ticket registration_fee
CREATE TABLE IF NOT EXISTS vendor_d_tiered_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  country_code TEXT NOT NULL,                -- 目的國 ISO code (e.g., 'US', 'GB')
  country_name TEXT,                          -- 顯示名稱
  weight_min_kg NUMERIC(10,4) NOT NULL,       -- 重量段下限（exclusive）
  weight_max_kg NUMERIC(10,4) NOT NULL,       -- 重量段上限（inclusive）
  rate_per_kg NUMERIC(10,4) NOT NULL,         -- HKD/KG (or other currency)
  registration_fee NUMERIC(10,4) NOT NULL DEFAULT 0,  -- 掛號費 per ticket
  currency VARCHAR(3) NOT NULL DEFAULT 'HKD',
  min_chargeable_weight_kg NUMERIC(10,4),     -- 最低計費重
  transit_days TEXT,                           -- 參考時效
  -- 版本化欄位
  version INTEGER DEFAULT 1,
  valid_from DATE,
  valid_to DATE,
  source TEXT,
  source_file TEXT,
  is_current BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendor_d_tiered_rates_vendor
  ON vendor_d_tiered_rates(vendor_id, country_code);
CREATE INDEX IF NOT EXISTS idx_vendor_d_tiered_rates_active
  ON vendor_d_tiered_rates(vendor_id) WHERE valid_to IS NULL;

-- ─── D-6: vendor_d_lookup_rates ─────────────────────────────────────────────
-- ECMS/郵政型：分區域 × 重量點 → 絕對金額查表
CREATE TABLE IF NOT EXISTS vendor_d_lookup_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  area_code TEXT NOT NULL,                    -- 區域代碼 (e.g., 'A', 'B', ... 'G')
  area_name TEXT,                             -- 區域描述
  weight_kg NUMERIC(10,4) NOT NULL,           -- 重量點 (e.g., 0.5, 1.0, 1.5...)
  amount NUMERIC(10,4) NOT NULL,              -- 該重量的絕對金額
  currency VARCHAR(3) NOT NULL DEFAULT 'JPY',
  -- 版本化欄位
  version INTEGER DEFAULT 1,
  valid_from DATE,
  valid_to DATE,
  source TEXT,
  source_file TEXT,
  is_current BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendor_d_lookup_rates_vendor
  ON vendor_d_lookup_rates(vendor_id, area_code);
CREATE INDEX IF NOT EXISTS idx_vendor_d_lookup_rates_active
  ON vendor_d_lookup_rates(vendor_id) WHERE valid_to IS NULL;

-- ─── D-6: 區域→國家對照表 ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendor_d_lookup_area_countries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  area_code TEXT NOT NULL,
  country_code TEXT NOT NULL,
  UNIQUE(vendor_id, country_code)
);

CREATE INDEX IF NOT EXISTS idx_vendor_d_lookup_area_countries_vendor
  ON vendor_d_lookup_area_countries(vendor_id, area_code);

-- ─── Apply sync triggers to new tables ──────────────────────────────────────
CREATE TRIGGER trg_sync_is_current
  BEFORE UPDATE ON vendor_d_tiered_rates
  FOR EACH ROW EXECUTE FUNCTION sync_is_current_from_valid_to();

CREATE TRIGGER trg_sync_is_current
  BEFORE UPDATE ON vendor_d_lookup_rates
  FOR EACH ROW EXECUTE FUNCTION sync_is_current_from_valid_to();
