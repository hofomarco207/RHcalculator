-- Migration 040: 競對價卡版本化
--
-- 背景：competitor_rate_cards 原本沒有版本概念，匯入時以 (competitor_name, service_code)
-- 為 key 直接刪舊插新，無法回溯對比歷史費率。本 migration 加入版本欄位、vendor_label
-- （用戶在匯入預覽時自訂的顯示名，per-sheet），以及同 B 段 rate 的 trigger 模式。
--
-- 版本 key：(competitor_name, service_code, country_code)
-- 同一產品的同一國在每個版本各一筆，valid_to IS NULL 代表現行版本。

ALTER TABLE competitor_rate_cards
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS valid_from DATE,
  ADD COLUMN IF NOT EXISTS valid_to DATE,
  ADD COLUMN IF NOT EXISTS is_current BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS source_file TEXT,
  ADD COLUMN IF NOT EXISTS vendor_label TEXT;

COMMENT ON COLUMN competitor_rate_cards.vendor_label IS
  '用戶在匯入預覽時自訂的顯示名，per-sheet。fallback 到 competitor_name。';
COMMENT ON COLUMN competitor_rate_cards.version IS
  '版本號，同一 (competitor_name, service_code, country_code) 從 1 起遞增。';

-- Backfill 現有資料：全部標為 v1、valid_from = effective_date 或 created_at
UPDATE competitor_rate_cards
SET valid_from = COALESCE(effective_date, created_at::date),
    version = 1,
    is_current = true
WHERE valid_from IS NULL;

-- Active index
CREATE INDEX IF NOT EXISTS idx_crc_active
  ON competitor_rate_cards (competitor_name, service_code, country_code)
  WHERE valid_to IS NULL;

CREATE INDEX IF NOT EXISTS idx_crc_versions
  ON competitor_rate_cards (competitor_name, service_code, country_code, version);

-- Trigger：set valid_to → 同步 is_current=false
DROP TRIGGER IF EXISTS trg_sync_is_current ON competitor_rate_cards;
CREATE TRIGGER trg_sync_is_current
  BEFORE UPDATE ON competitor_rate_cards
  FOR EACH ROW EXECUTE FUNCTION sync_is_current_from_valid_to();
