-- Migration 045: 對齊競對價卡版本的 valid_from / valid_to
--
-- 將所有 competitor_rate_cards 的版本日期統一改成下列基準（per RH 對帳期）：
--   v1 → 2026-03-30
--   v2 → 2026-04-06
--   v3 → 2026-04-20
--   v4 → 2026-04-29
--
-- valid_to 採「下個版本的前一天」；若某張卡（competitor_name, service_code, country）
-- 沒有更高版本，valid_to 留 NULL（保持為 is_current）。Trigger
-- `sync_is_current_from_valid_to`（migration 040）會自動同步 is_current 旗標。

BEGIN;

-- 1. 設 valid_from
UPDATE competitor_rate_cards SET valid_from = DATE '2026-03-30' WHERE version = 1;
UPDATE competitor_rate_cards SET valid_from = DATE '2026-04-06' WHERE version = 2;
UPDATE competitor_rate_cards SET valid_from = DATE '2026-04-20' WHERE version = 3;
UPDATE competitor_rate_cards SET valid_from = DATE '2026-04-29' WHERE version = 4;

-- 2. 設 valid_to：只有「同 (competitor_name, service_code, country_code) 存在更高版本」
--    的 row 才被關閉；否則保持 NULL（仍是 is_current）。

-- v1: 若同卡有 v2 就關到 v2 前一天
UPDATE competitor_rate_cards c1
SET valid_to = DATE '2026-04-05'
WHERE c1.version = 1
  AND EXISTS (
    SELECT 1 FROM competitor_rate_cards c2
    WHERE c2.competitor_name = c1.competitor_name
      AND c2.service_code    = c1.service_code
      AND c2.country_code IS NOT DISTINCT FROM c1.country_code
      AND c2.version = 2
  );

-- v2: 若同卡有 v3 就關到 v3 前一天
UPDATE competitor_rate_cards c1
SET valid_to = DATE '2026-04-19'
WHERE c1.version = 2
  AND EXISTS (
    SELECT 1 FROM competitor_rate_cards c2
    WHERE c2.competitor_name = c1.competitor_name
      AND c2.service_code    = c1.service_code
      AND c2.country_code IS NOT DISTINCT FROM c1.country_code
      AND c2.version = 3
  );

-- v3: 若同卡有 v4 就關到 v4 前一天
UPDATE competitor_rate_cards c1
SET valid_to = DATE '2026-04-28'
WHERE c1.version = 3
  AND EXISTS (
    SELECT 1 FROM competitor_rate_cards c2
    WHERE c2.competitor_name = c1.competitor_name
      AND c2.service_code    = c1.service_code
      AND c2.country_code IS NOT DISTINCT FROM c1.country_code
      AND c2.version = 4
  );

-- v4: 永遠最新，valid_to 強制 NULL（trigger 會把 is_current 設回 true）
UPDATE competitor_rate_cards SET valid_to = NULL WHERE version = 4;

-- 3. 對任何 version >= 5 的紀錄不動（未來新匯入）。
--    這個 migration 只處理 v1..v4。

COMMIT;

-- 驗證查詢（執行後可在 SQL editor 跑來檢查結果）：
--   SELECT version, MIN(valid_from), MAX(valid_to),
--          SUM((is_current)::int) AS current_rows,
--          COUNT(*) AS total_rows
--   FROM competitor_rate_cards
--   GROUP BY version
--   ORDER BY version;
