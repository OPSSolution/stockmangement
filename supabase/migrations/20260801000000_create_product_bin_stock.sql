-- ============================================================
-- Bin stock split — lets one product's total stock be spread across
-- several bin locations within its warehouse (e.g. 100 units in A.1.1,
-- 100 units in A.1.2) instead of the single products.bin_location only
-- being able to point at one place. products.bin_location is left as
-- a quick-glance "primary bin" for products that only ever sit in one
-- spot; product_bin_stock is the source of truth once a product is
-- split across more than one bin.
-- ============================================================

CREATE TABLE IF NOT EXISTS product_bin_stock (
  id text PRIMARY KEY,
  product_id text NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  bin_location text NOT NULL,
  quantity integer NOT NULL CHECK (quantity >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, bin_location)
);

ALTER TABLE product_bin_stock ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to product_bin_stock"
  ON product_bin_stock
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_product_bin_stock_product_id
  ON product_bin_stock(product_id);
