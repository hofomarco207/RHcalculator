-- ============================================================
-- Migration 020: Scenario 多國支援 + D-model 擴展
-- ============================================================

-- ─── 1. Scenario 出發倉庫 ───────────────────────────────────────────────────
ALTER TABLE scenarios ADD COLUMN IF NOT EXISTS origin_warehouse TEXT DEFAULT 'HK';

-- ─── 2. Scenario 目的地範圍 ─────────────────────────────────────────────────
-- 'single' = 現有行為，綁定 country_code
-- 'multi'  = 多國，目的國從 D段 vendor 費率表動態取得
ALTER TABLE scenarios ADD COLUMN IF NOT EXISTS destination_scope TEXT DEFAULT 'single';

-- ─── 3. Scenario BCD 合併 vendor 引用 ───────────────────────────────────────
ALTER TABLE scenarios ADD COLUMN IF NOT EXISTS vendor_bcd_id UUID REFERENCES vendors(id);

-- ─── 4. A段多倉支援（透過 vendor config JSONB）──────────────────────────────
-- 現有 A段 vendor 用 country_code = 'GLB' 表示全球通用（HK倉）
-- 新增：用 config.warehouse 區分倉庫（'HK' / 'JP' 等）
-- 不需 schema 變更，vendor.config JSONB 已存在（migration 008）
-- 使用方式：INSERT INTO vendors (name, segment, country_code, config)
--   VALUES ('JP倉攬收', 'A', 'GLB', '{"warehouse": "JP"}')

-- ─── 5. 更新 d_pricing_model 可選值 ─────────────────────────────────────────
-- 現有值：'zone_based' | 'first_additional' | 'weight_bracket' | 'simple'
-- 新增值：'tiered_per_kg' | 'lookup_table'
-- d_pricing_model 沒有 CHECK constraint（TEXT column with DEFAULT），不需 ALTER
-- 但加上 COMMENT 文檔化
COMMENT ON COLUMN scenarios.d_pricing_model IS
  'D段定價模型: zone_based | first_additional | weight_bracket | simple | tiered_per_kg | lookup_table';

-- ─── 6. 更新 scenarios.pricing_mode 支援 bcd_combined ──────────────────────
-- pricing_mode 也是 TEXT column 無 CHECK，加 COMMENT
COMMENT ON COLUMN scenarios.pricing_mode IS
  '定價模式: segmented | bc_combined | bcd_combined';
