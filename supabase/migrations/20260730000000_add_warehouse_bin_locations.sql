-- ============================================================
-- Bin Locations registry per warehouse — a warehouse officer defines the
-- physical bin codes that exist in a warehouse (e.g. "A.1.1", "A.1.2") from
-- a dedicated card on the Warehouse detail page, the same way Staff on Duty
-- is managed. Separate from products.bin_location (which one is currently
-- assigned to each product).
-- ============================================================

ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS bin_locations jsonb NOT NULL DEFAULT '[]'::jsonb;
