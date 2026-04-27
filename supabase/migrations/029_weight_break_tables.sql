-- Migration 029: Customer weight break data tables
-- Per M6 (Weight Break Data Module): store customer weight distribution for weighted margin verification

CREATE TABLE weight_break_datasets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code text NOT NULL REFERENCES countries(code),
  label text NOT NULL,
  period text,
  total_orders integer,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE weight_break_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id uuid NOT NULL REFERENCES weight_break_datasets(id) ON DELETE CASCADE,
  weight_kg numeric NOT NULL,
  order_count integer NOT NULL,
  total_weight numeric GENERATED ALWAYS AS (weight_kg * order_count) STORED
);

CREATE INDEX idx_wbe_dataset ON weight_break_entries(dataset_id);
