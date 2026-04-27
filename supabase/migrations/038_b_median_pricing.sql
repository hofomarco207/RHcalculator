-- Migration 038: B段 median + buffer pricing
--
-- Background: 初期預算費用不應該假設永遠拿得到「最便宜」那家 service。
-- 改用中位數 + buffer：每個 gateway × tier 對所有可選 service 算 rate 與
-- mawb_fixed 的中位數，再乘 (1 + buffer_pct) 做保守估計。
--
-- 觸發條件：該 gateway × tier 可選 service ≥ 2 才套用；只有 1 家時退回原本
-- 「挑最便宜」邏輯。
--
-- buffer_pct 存在 vendors.config.b_buffer_pct（JSONB，預設 0.10 = 10%）。
-- use_median_pricing 為 scenario 層級 flag：新方案預設 true，舊方案保留 false
-- 以維持向後兼容。

-- 1. Scenario 層 flag
ALTER TABLE scenarios
  ADD COLUMN IF NOT EXISTS use_median_pricing BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN scenarios.use_median_pricing IS
  'B段中位數 + buffer 定價模式：true 啟用，false 退回「挑最便宜」。舊方案保留 false。';

-- 2. 不需要改 vendors 表結構 — config 是 JSONB，直接放 b_buffer_pct 即可
--    Example: UPDATE vendors SET config = jsonb_set(COALESCE(config, '{}'::jsonb), '{b_buffer_pct}', '0.10');

-- 3. 新方案預設啟用中位數定價：改 default 並不影響既有資料
ALTER TABLE scenarios
  ALTER COLUMN use_median_pricing SET DEFAULT true;
