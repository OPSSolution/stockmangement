-- ============================================================
-- Bin location (Put Away) — lets a warehouse officer record exactly where
-- a product physically sits (e.g. "A.1.1" = Aisle A, Cabinet 1, Position 1)
-- so other staff can find and pick it back later. Free-text, set from the
-- Warehouse detail page's product list.
-- ============================================================

ALTER TABLE products ADD COLUMN IF NOT EXISTS bin_location text;
