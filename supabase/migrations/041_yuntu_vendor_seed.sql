-- Migration 041: Yuntu D-segment vendor seed
INSERT INTO vendors (id, name, segment, notes, config, is_active)
VALUES (
  '11111111-2222-3333-4444-555566667777',
  '雲途 HKTHZXR',
  'D',
  '雲途全球小包尾程服務 (HKG→世界), 路線代號 HKTHZXR',
  '{"d_pricing_model": "tiered_per_kg"}',
  true
)
ON CONFLICT (id) DO NOTHING;
