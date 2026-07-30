-- ============================================================
-- Products/warehouse split, step 3 of 3 — cut over. Destructive.
--
-- Run ONLY after 20260806000000 and 20260806000001 have been applied AND
-- the app's data-access code has been deployed to read/write
-- product_warehouse_stock instead of products.warehouse/stock/etc. The
-- moment this runs, every caller still reading the old columns breaks
-- immediately — this is the actual point of no return for the old shape.
-- ============================================================

-- product_bin_stock is now warehouse-scoped for every row (backfilled in
-- the previous migration) — enforce it and fix the unique constraint to
-- match, since a bin-location string like "A.1.1" is warehouse-local and
-- can legitimately be reused across two different warehouses.
ALTER TABLE product_bin_stock ALTER COLUMN warehouse SET NOT NULL;
ALTER TABLE product_bin_stock DROP CONSTRAINT IF EXISTS product_bin_stock_product_id_bin_location_key;
ALTER TABLE product_bin_stock ADD CONSTRAINT product_bin_stock_product_warehouse_bin_key
  UNIQUE (product_id, warehouse, bin_location);
CREATE INDEX IF NOT EXISTS idx_product_bin_stock_warehouse ON product_bin_stock(warehouse);

-- SKU reverts to globally unique — one master row per SKU now that
-- warehouse duplication is gone. Reverses 20260715000000_products_sku_unique_per_warehouse.sql.
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_sku_warehouse_key;
ALTER TABLE products ADD CONSTRAINT products_sku_key UNIQUE (sku);

-- Drop every column that moved to product_warehouse_stock.
ALTER TABLE products
  DROP COLUMN IF EXISTS warehouse,
  DROP COLUMN IF EXISTS vendor,
  DROP COLUMN IF EXISTS stock,
  DROP COLUMN IF EXISTS on_hold_stock,
  DROP COLUMN IF EXISTS low_stock_threshold,
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS expiry_date,
  DROP COLUMN IF EXISTS bin_location;
