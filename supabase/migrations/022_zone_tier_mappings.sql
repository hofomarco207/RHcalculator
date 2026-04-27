-- Zone/Tier mappings for non-US countries (e.g., South Africa Tier1/2/3, Peru zones)
-- Maps city/postal_code to zone/tier for D-segment cost weighting.
-- US zone data remains in vendor D-config (carrier-specific zone assignments).

CREATE TABLE IF NOT EXISTS zone_tier_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code text NOT NULL,
  province text,
  city text,
  postal_code text,
  zone text NOT NULL,
  risk_flag text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ztm_country ON zone_tier_mappings(country_code);
CREATE INDEX IF NOT EXISTS idx_ztm_country_zone ON zone_tier_mappings(country_code, zone);
CREATE INDEX IF NOT EXISTS idx_ztm_search ON zone_tier_mappings(country_code, city, postal_code);

-- RPC for aggregation (bypasses PostgREST default 1000-row limit)
CREATE OR REPLACE FUNCTION zone_tier_distribution(p_country text DEFAULT NULL)
RETURNS TABLE(country_code text, zone text, cnt bigint) AS $$
  SELECT country_code, zone, COUNT(*) as cnt
  FROM zone_tier_mappings
  WHERE (p_country IS NULL OR zone_tier_mappings.country_code = p_country)
  GROUP BY country_code, zone
  ORDER BY country_code, zone;
$$ LANGUAGE sql STABLE;
