-- Migration 030: Add additional_surcharge column to all vendor rate tables
-- Per M9 (Cost Import Optimization): placeholder for per-unit surcharges/misc fees

ALTER TABLE vendor_b_rates ADD COLUMN IF NOT EXISTS additional_surcharge numeric DEFAULT 0;
ALTER TABLE vendor_c_rates ADD COLUMN IF NOT EXISTS additional_surcharge numeric DEFAULT 0;
ALTER TABLE vendor_bc_rates ADD COLUMN IF NOT EXISTS additional_surcharge numeric DEFAULT 0;
ALTER TABLE vendor_d_rates ADD COLUMN IF NOT EXISTS additional_surcharge numeric DEFAULT 0;
ALTER TABLE vendor_d_tiered_rates ADD COLUMN IF NOT EXISTS additional_surcharge numeric DEFAULT 0;
ALTER TABLE vendor_d_lookup_rates ADD COLUMN IF NOT EXISTS additional_surcharge numeric DEFAULT 0;
