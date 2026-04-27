-- ============================================================
-- Migration 012: Drop legacy cost parameter tables
-- These tables were only used by the old flat-param cost engine (cost.ts/pricing.ts)
-- which has been removed in favor of the vendor-based scenario engine.
-- ============================================================

DROP TABLE IF EXISTS air_freight_ports;
DROP TABLE IF EXISTS air_freight_settings;
DROP TABLE IF EXISTS segment_a_costs;
DROP TABLE IF EXISTS clearance_costs;
