-- ============================================================
-- Migration 019: BCD 合併費率表 + cost_estimates 表
-- ============================================================

-- ─── BCD 合併費率表（lookup_table 結構）──────────────────────────────────────
-- ECMS 日本等場景：一口價含空運+清關+派送，area × weight → 絕���金額
-- 注意：與現有 vendor_bc_rates（flat per_kg + handling）不同結構
CREATE TABLE IF NOT EXISTS vendor_bcd_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  area_code TEXT NOT NULL,                    -- 區域代碼
  area_name TEXT,                             -- 區域描述
  weight_kg NUMERIC(10,4) NOT NULL,           -- 重量點
  amount NUMERIC(10,4) NOT NULL,              -- 該重量的絕對金額
  currency VARCHAR(3) NOT NULL DEFAULT 'JPY',
  fuel_surcharge_pct NUMERIC(6,2),            -- 燃油附加費比例（如有）
  -- 版本化欄位
  version INTEGER DEFAULT 1,
  valid_from DATE,
  valid_to DATE,
  source TEXT,
  source_file TEXT,
  is_current BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendor_bcd_rates_vendor
  ON vendor_bcd_rates(vendor_id, area_code);
CREATE INDEX IF NOT EXISTS idx_vendor_bcd_rates_active
  ON vendor_bcd_rates(vendor_id) WHERE valid_to IS NULL;

-- 共用 vendor_d_lookup_area_countries 做區域→國家對照（已在 018 建立）

-- ─── Sync trigger ────────────────────────────────────────���──────────────────
CREATE TRIGGER trg_sync_is_current
  BEFORE UPDATE ON vendor_bcd_rates
  FOR EACH ROW EXECUTE FUNCTION sync_is_current_from_valid_to();

-- ─── cost_estimates 表（價卡判讀 Skill 輸出）────────────────────────────────
CREATE TABLE IF NOT EXISTS cost_estimates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID REFERENCES vendors(id),
  segment TEXT NOT NULL,                      -- 'B' | 'C' | 'D' | 'BC' | 'BCD'
  country_code TEXT,
  route_origin TEXT,                          -- 起運口岸/倉庫
  route_destination TEXT,                     -- 目的口岸/國家
  estimate_data JSONB NOT NULL,               -- Skill Phase 3 的 cost_estimate 完整 JSON
  user_confirmed_values JSONB,                -- 用戶確認的最終值
  source_file TEXT,                           -- 原始報價檔案名
  interpreted_at DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cost_estimates_vendor
  ON cost_estimates(vendor_id, segment);

-- ─── 更新 vendors segment CHECK 加 'BCD' ────────────────────────────────────
ALTER TABLE vendors DROP CONSTRAINT IF EXISTS vendors_segment_check;
ALTER TABLE vendors ADD CONSTRAINT vendors_segment_check
  CHECK (segment IN ('A', 'B', 'C', 'D', 'BC', 'BCD'));

-- ─── 更新 countries pricing_mode CHECK 加 'bcd_combined' ────────────────────
ALTER TABLE countries DROP CONSTRAINT IF EXISTS countries_pricing_mode_check;
ALTER TABLE countries ADD CONSTRAINT countries_pricing_mode_check
  CHECK (pricing_mode IN ('segmented', 'bc_combined', 'bcd_combined'));
