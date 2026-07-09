-- ============================================================
-- Stock Requests — support requesting multiple products in a
-- single request, matching the items-array pattern already used
-- by transfers and purchases.
-- ============================================================

ALTER TABLE stock_requests ADD COLUMN IF NOT EXISTS items jsonb NOT NULL DEFAULT '[]';
ALTER TABLE stock_requests ADD COLUMN IF NOT EXISTS total_items integer NOT NULL DEFAULT 0;

-- Backfill existing single-product rows into the new items array shape.
-- Keys are camelCase to match what the frontend reads (productId/productName).
UPDATE stock_requests
SET items = jsonb_build_array(
      jsonb_build_object(
        'productId', product_id,
        'productName', product_name,
        'sku', sku,
        'quantity', quantity_requested
      )
    ),
    total_items = quantity_requested
WHERE items = '[]'::jsonb;

-- Drop the old single-product columns now that everything lives in items.
ALTER TABLE stock_requests DROP COLUMN IF EXISTS product_id;
ALTER TABLE stock_requests DROP COLUMN IF EXISTS product_name;
ALTER TABLE stock_requests DROP COLUMN IF EXISTS sku;
ALTER TABLE stock_requests DROP COLUMN IF EXISTS quantity_requested;
