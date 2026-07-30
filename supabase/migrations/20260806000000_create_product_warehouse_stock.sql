-- ============================================================
-- Products/warehouse split, step 1 of 3 (additive only).
--
-- Today `products.warehouse` means one product row belongs to exactly one
-- warehouse — the same SKU stocked in two warehouses is two separate rows
-- with two different ids, which can silently drift apart (different price/
-- category) and forces transfers to clone a whole new product at the
-- destination. This introduces `product_warehouse_stock` as the per-
-- warehouse stock record (the same relationship `product_bin_stock` already
-- has to bins, one level up) so a product can eventually become one master
-- row with stock tracked per warehouse instead of duplicated wholesale.
--
-- This migration only adds things — nothing on `products` is touched or
-- dropped yet, so every existing query keeps working unmodified. See
-- 20260806000001 (backfill/merge) and 20260806000002 (cleanup/cutover)
-- for the rest of the sequence.
-- ============================================================

CREATE TABLE IF NOT EXISTS product_warehouse_stock (
  id text PRIMARY KEY,
  product_id text NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  warehouse text NOT NULL,
  stock integer NOT NULL DEFAULT 0,
  on_hold_stock integer NOT NULL DEFAULT 0,
  low_stock_threshold integer NOT NULL DEFAULT 10,
  status text NOT NULL DEFAULT 'in_stock' CHECK (status IN ('in_stock', 'low_stock', 'out_of_stock')),
  vendor text,
  expiry_date date,
  bin_location text,
  last_updated text NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, warehouse)
);

ALTER TABLE product_warehouse_stock ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read product_warehouse_stock"
  ON product_warehouse_stock FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Staff and admin can modify product_warehouse_stock"
  ON product_warehouse_stock FOR ALL
  USING (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'staff')));

CREATE INDEX IF NOT EXISTS idx_pws_product_id ON product_warehouse_stock(product_id);
CREATE INDEX IF NOT EXISTS idx_pws_warehouse ON product_warehouse_stock(warehouse);

-- Plain text column (not an FK to product_warehouse_stock.id) so existing
-- product_bin_stock call sites don't need the synthetic PWS id at insert
-- time — matches how product_bin_stock already stores bin_location as free
-- text rather than an FK into a bins table. Nullable for now; tightened to
-- NOT NULL in the cleanup migration once every row has been backfilled.
ALTER TABLE product_bin_stock ADD COLUMN IF NOT EXISTS warehouse text;
