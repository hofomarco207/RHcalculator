-- Allow scenarios to source D-segment pricing from a competitor rate card group
-- instead of (or instead of requiring) a vendor_d_id entry.
-- Key = (d_competitor_name, d_service_code) matches competitor_rate_cards rows.
ALTER TABLE scenarios
  ADD COLUMN IF NOT EXISTS d_competitor_name text,
  ADD COLUMN IF NOT EXISTS d_service_code   text;
