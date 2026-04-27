-- v3.1: Country soft delete support
ALTER TABLE countries ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
