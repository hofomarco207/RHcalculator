-- Migration 039: persist BC / B2C 段拋率（bc_bubble_ratio）
--
-- 背景：scenarios 表原本有 b_bubble_rate / b1_bubble_ratio 兩個 B 段拋率欄位，但 BC
-- 合併與 multi_b_b2c 模式下 B2C 段的拋率（bc_bubble_ratio）只在前端 state 與計算
-- 引擎中使用，從未落 DB。結果是：新增/更新方案時即使調整了拋率也不會被儲存，
-- 載入方案後前端只能 fallback 到 1.0。
--
-- 本 migration 新增 numeric 欄位並 default 1.0（等同過往 fallback 行為，
-- 已存在的方案不受影響）。

ALTER TABLE scenarios
  ADD COLUMN IF NOT EXISTS bc_bubble_ratio NUMERIC(6,4) NOT NULL DEFAULT 1.0;

COMMENT ON COLUMN scenarios.bc_bubble_ratio IS
  'BC 合併 / multi_b_b2c B2C 段的拋率，計算引擎使用。1.0 = 不計泡。';
