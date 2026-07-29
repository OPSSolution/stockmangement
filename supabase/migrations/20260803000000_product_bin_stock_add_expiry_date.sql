-- Expiry date is tracked per bin now, not just per product — a product split
-- across bins can have a different batch (and expiry) sitting in each one.
-- products.expiry_date is kept in sync as the nearest upcoming expiry across
-- a product's bins, so existing product-level displays keep working.
ALTER TABLE product_bin_stock ADD COLUMN IF NOT EXISTS expiry_date date;
