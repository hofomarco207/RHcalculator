-- ============================================================
-- Migration 017: B段附加費結構重構 — surcharges JSONB
-- ============================================================
-- 將固定欄位 (pickup_fee, handling_fee, ...) 遷移到結構化 JSONB
-- 支援 per_mawb / per_kg / per_kg_with_min / per_hawb / conditional
-- 保留舊欄位向後兼容

-- ─── 1. 新增 surcharges JSONB 欄位 ──────────────────────────────────────────
ALTER TABLE vendor_b_rates ADD COLUMN IF NOT EXISTS surcharges JSONB DEFAULT '[]';

-- ─── 2. 遷移既有數據：6 個固定欄位 → surcharges JSONB array ─────────────────
-- 只遷移 fee > 0 的項目，每項標註 unit='per_mawb'（現有全部是 per_mawb 固定金額）
UPDATE vendor_b_rates
SET surcharges = COALESCE((
  SELECT jsonb_agg(item ORDER BY ord)
  FROM (
    SELECT 1 AS ord, jsonb_build_object(
      'name', '提货费', 'unit', 'per_mawb', 'amount', pickup_fee,
      'rate', null, 'min', null, 'currency', currency,
      'condition', null, 'from_notes', false
    ) AS item WHERE pickup_fee > 0
    UNION ALL
    SELECT 2, jsonb_build_object(
      'name', '过港费', 'unit', 'per_mawb', 'amount', handling_fee,
      'rate', null, 'min', null, 'currency', currency,
      'condition', null, 'from_notes', false
    ) WHERE handling_fee > 0
    UNION ALL
    SELECT 3, jsonb_build_object(
      'name', '操作费', 'unit', 'per_mawb', 'amount', operation_fee,
      'rate', null, 'min', null, 'currency', currency,
      'condition', null, 'from_notes', false
    ) WHERE operation_fee > 0
    UNION ALL
    SELECT 4, jsonb_build_object(
      'name', '文件费', 'unit', 'per_mawb', 'amount', document_fee,
      'rate', null, 'min', null, 'currency', currency,
      'condition', null, 'from_notes', false
    ) WHERE document_fee > 0
    UNION ALL
    SELECT 5, jsonb_build_object(
      'name', '验电费', 'unit', 'per_mawb', 'amount', battery_check_fee,
      'rate', null, 'min', null, 'currency', currency,
      'condition', null, 'from_notes', false
    ) WHERE battery_check_fee > 0
    UNION ALL
    SELECT 6, jsonb_build_object(
      'name', '报关费', 'unit', 'per_mawb', 'amount', customs_fee,
      'rate', null, 'min', null, 'currency', currency,
      'condition', null, 'from_notes', false
    ) WHERE customs_fee > 0
  ) items
), '[]'::jsonb)
WHERE (pickup_fee + handling_fee + operation_fee + document_fee + battery_check_fee + customs_fee) > 0;
