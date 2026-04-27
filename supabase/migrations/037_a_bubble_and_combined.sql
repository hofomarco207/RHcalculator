-- Migration 037: A段 bubble_ratio + per_kg/per_piece coexistence
-- Background: A段 vendors (e.g. EA Solution HK warehouse) need both per-kg fees
-- (處理費) AND per-piece fees (換單) applied simultaneously, plus a bubble ratio
-- on the per-kg portion. Old a_pricing_mode column is retained for back-compat
-- but the calculator no longer branches on it — fields are additive.
--
-- Formula: A段成本 = (pickup + sorting?) × weight × bubble_ratio + per_piece_fee→HKD

-- 1. Add bubble_ratio to vendor_a_rates
ALTER TABLE vendor_a_rates
  ADD COLUMN IF NOT EXISTS bubble_ratio NUMERIC(6,4) NOT NULL DEFAULT 1.0;

-- 2. Seed: EA Solution (HK warehouse)
--    處理費 HKD 4/kg, 拋率 1.1, 換單 HKD 1/pcs
--    Upsert current vendor_a_rates row (deactivate old, insert new with bubble)

DO $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM vendors
  WHERE name = 'EA Solution' AND segment = 'A'
  LIMIT 1;

  IF v_id IS NULL THEN
    RAISE NOTICE 'EA Solution vendor not found — skipping seed. Please create it via UI and re-run seed block.';
  ELSE
    -- Deactivate any current rates
    UPDATE vendor_a_rates
       SET is_current = false
     WHERE vendor_id = v_id AND is_current = true;

    -- Insert fresh current rate
    INSERT INTO vendor_a_rates (
      vendor_id, pickup_hkd_per_kg, sorting_hkd_per_kg, include_sorting,
      bubble_ratio, notes, is_current
    ) VALUES (
      v_id, 4.0, 0.0, false,
      1.1, 'migration 037 seed: 處理費 HKD 4/kg × 拋率 1.1', true
    );

    -- Update vendor-level per_piece config (換單 HKD 1/pcs)
    UPDATE vendors
       SET per_piece_fee = 1,
           per_piece_currency = 'HKD',
           a_pricing_mode = 'per_kg'  -- still per_kg-primary; per_piece is additive now
     WHERE id = v_id;
  END IF;
END $$;

-- 3. Comment for future readers
COMMENT ON COLUMN vendor_a_rates.bubble_ratio IS
  'A段拋率, applies to per-kg portion: perKg = (pickup + sorting?) × weight × bubble_ratio. Default 1.0 (no bubble).';
