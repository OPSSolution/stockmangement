-- ============================================================
-- Products/warehouse split, step 2 of 3 (data migration).
--
-- Run this by hand against a staging snapshot first and inspect the row
-- counts before running it against production — it mutates/deletes rows,
-- unlike step 1. It does NOT touch any existing `products` columns, so the
-- current app keeps working unmodified for as long as this sits deployed
-- before step 3 (cleanup/cutover) runs.
--
-- What it does, in order:
--   1. One product_warehouse_stock row per existing products row, carrying
--      over every field that's about to stop being warehouse-agnostic.
--   2. Backfill product_bin_stock.warehouse from the product that owned
--      each bin row at this point (must run before product_id gets
--      re-pointed below).
--   3. Pick one canonical products row per SKU (lowest id).
--   4. Re-point every non-canonical row's dependents (product_warehouse_
--      stock, product_bin_stock, stock_history) onto the canonical id.
--   5. Delete the now-redundant non-canonical products rows.
-- ============================================================

BEGIN;

INSERT INTO product_warehouse_stock
  (id, product_id, warehouse, stock, on_hold_stock, low_stock_threshold, status, vendor, expiry_date, bin_location, last_updated, created_at)
SELECT
  'PWS-' || p.id || '-' || substr(md5(p.warehouse), 1, 6),
  p.id, p.warehouse, p.stock, COALESCE(p.on_hold_stock, 0), p.low_stock_threshold,
  p.status, p.vendor, p.expiry_date, p.bin_location, p.last_updated, now()
FROM products p
ON CONFLICT (product_id, warehouse) DO NOTHING;

UPDATE product_bin_stock pbs
SET warehouse = p.warehouse
FROM products p
WHERE pbs.product_id = p.id AND pbs.warehouse IS NULL;

-- Recomputed inline (rather than a CREATE TEMP TABLE) in every statement
-- below — Supabase's SQL Editor runs scripts over a pooled connection where
-- a temp table isn't guaranteed to survive to the next statement. Safe to
-- recompute each time since nothing before the final DELETE removes rows
-- from `products`, so the mapping is identical across every statement.
UPDATE product_warehouse_stock pws
SET product_id = sc.canonical_id
FROM products p
JOIN (SELECT sku, MIN(id) AS canonical_id FROM products GROUP BY sku) sc ON sc.sku = p.sku
WHERE pws.product_id = p.id AND p.id <> sc.canonical_id;

UPDATE product_bin_stock pbs
SET product_id = sc.canonical_id
FROM products p
JOIN (SELECT sku, MIN(id) AS canonical_id FROM products GROUP BY sku) sc ON sc.sku = p.sku
WHERE pbs.product_id = p.id AND p.id <> sc.canonical_id;

UPDATE stock_history sh
SET product_id = sc.canonical_id
FROM products p
JOIN (SELECT sku, MIN(id) AS canonical_id FROM products GROUP BY sku) sc ON sc.sku = p.sku
WHERE sh.product_id = p.id AND p.id <> sc.canonical_id;

-- product_categories (unused join table, no app code queries it) cascade-
-- deletes silently. purchases/transfers/orders/returns/promotions store
-- productId inside jsonb item snapshots (not FK-linked) and already embed
-- productName/sku at time of creation, so historical documents keep
-- displaying correctly even though the id they reference no longer
-- resolves to a live products row.
DELETE FROM products p
USING (SELECT sku, MIN(id) AS canonical_id FROM products GROUP BY sku) sc
WHERE p.sku = sc.sku AND p.id <> sc.canonical_id;

COMMIT;
