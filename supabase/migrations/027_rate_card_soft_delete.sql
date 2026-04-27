-- Migration 027: Add soft delete to rate_cards
-- Adds deleted_at column for soft delete support

ALTER TABLE rate_cards ADD COLUMN deleted_at timestamptz;
