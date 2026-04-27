-- ============================================================
-- Migration 024: Multi-Leg B段 + Scenario 層級 pricing_mode
-- Background: Some routes have two air freight legs (e.g. JP→HK→US).
-- B段 can be B1+B2. Two new pricing_modes: multi_b (A+B1+B2+C+D)
-- and multi_b_b2c (A+B1+B2C+D, where B2C includes customs).
-- ============================================================

-- ─── 1. scenarios 表新增 B2 段欄位 ─────────────────────────────────────────────
ALTER TABLE scenarios
  ADD COLUMN IF NOT EXISTS vendor_b2_id uuid REFERENCES vendors(id),
  ADD COLUMN IF NOT EXISTS b2_service_name text,
  ADD COLUMN IF NOT EXISTS b2_gateway_mode text DEFAULT 'proportional'
    CHECK (b2_gateway_mode IN ('proportional', 'single', 'manual')),
  ADD COLUMN IF NOT EXISTS b2_single_gateway text,
  ADD COLUMN IF NOT EXISTS b2_manual_proportions jsonb;

-- ─── 2. countries 表 pricing_mode CHECK 擴展 ──────────────────────────────────
-- countries 表有 CHECK constraint（019 建立），需 DROP + ADD
ALTER TABLE countries
  DROP CONSTRAINT IF EXISTS countries_pricing_mode_check;
ALTER TABLE countries
  ADD CONSTRAINT countries_pricing_mode_check
    CHECK (pricing_mode IN ('segmented', 'bc_combined', 'bcd_combined', 'multi_b', 'multi_b_b2c'));

-- ─── 3. 更新 scenarios.pricing_mode COMMENT ───────────────────────────────────
-- scenarios 表 pricing_mode 無 CHECK（TEXT column），只更新 COMMENT
COMMENT ON COLUMN scenarios.pricing_mode IS
  '定價模式: segmented | bc_combined | bcd_combined | multi_b | multi_b_b2c';
