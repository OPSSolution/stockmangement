-- ============================================================
-- Warehouses — track which vendors are approved/available for a
-- given warehouse, so the Add Product form can scope its Vendor
-- dropdown to just that warehouse's own vendors.
-- ============================================================

ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS vendor_names text[] NOT NULL DEFAULT '{}';
