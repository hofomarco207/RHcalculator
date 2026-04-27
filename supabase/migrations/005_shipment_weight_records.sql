-- Lightweight shipment records for weight distribution analysis.
-- Unlike historical_shipments, these do NOT require gateway/zip_code.

CREATE TABLE IF NOT EXISTS shipment_weight_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  batch_id UUID REFERENCES import_batches(id),
  billable_weight_kg NUMERIC NOT NULL,
  product_type TEXT NOT NULL CHECK (product_type IN ('economy', 'premium')),
  carrier TEXT,
  shipment_date DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_swr_shipment_date ON shipment_weight_records(shipment_date);
CREATE INDEX idx_swr_product_type ON shipment_weight_records(product_type);
CREATE INDEX idx_swr_batch_id ON shipment_weight_records(batch_id);
