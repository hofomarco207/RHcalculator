-- Migration 031: Independent B1 bubble ratio for multi-leg modes
-- Previously B1 and B2 shared scenario.b_bubble_rate.
-- b1_bubble_ratio is B1-specific; when NULL, falls back to b_bubble_rate for backward compatibility.

ALTER TABLE scenarios ADD COLUMN b1_bubble_ratio NUMERIC(6,4);
