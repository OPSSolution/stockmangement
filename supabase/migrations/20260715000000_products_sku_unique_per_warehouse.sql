-- ============================================================
-- Products — a SKU should be unique per warehouse, not globally.
-- The old global UNIQUE(sku) blocked the same product from ever
-- existing as separate stock records in two different warehouses,
-- which is exactly what completing a transfer needs to do (create
-- the item at the destination warehouse while it still exists at
-- the source). No foreign keys reference products.sku (they all
-- reference products.id), so this is safe to change.
-- ============================================================

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_sku_key;
ALTER TABLE products ADD CONSTRAINT products_sku_warehouse_key UNIQUE (sku, warehouse);
