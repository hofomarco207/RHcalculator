-- Add service_name to vendor_b_rates (the service/airline option within a vendor)
ALTER TABLE vendor_b_rates ADD COLUMN IF NOT EXISTS service_name TEXT;

-- Update index
DROP INDEX IF EXISTS idx_vb_vendor_gw;
CREATE INDEX idx_vb_vendor_gw_svc ON vendor_b_rates(vendor_id, gateway_code, service_name);
