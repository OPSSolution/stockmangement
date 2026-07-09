-- ============================================================
-- Stock Requests — staff request restocks for their warehouse;
-- admin approves and fulfills via a Transfer or Purchase Order.
-- ============================================================

CREATE TABLE IF NOT EXISTS stock_requests (
  id text PRIMARY KEY,
  product_id text NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  product_name text NOT NULL,
  sku text NOT NULL,
  warehouse text NOT NULL,
  requested_by text NOT NULL,
  quantity_requested integer NOT NULL CHECK (quantity_requested > 0),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  reason text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'fulfilled', 'cancelled')),
  fulfillment_type text CHECK (fulfillment_type IN ('transfer', 'purchase')),
  fulfillment_ref_id text,
  reviewed_by text,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE stock_requests ENABLE ROW LEVEL SECURITY;

-- Matches the permissive policy used by every other table in this project today
-- (see stock_history, categories migrations) — access is gated in the app layer
-- via warehouseScope and role permissions, not by RLS.
CREATE POLICY "Allow all access to stock_requests"
  ON stock_requests
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_stock_requests_warehouse ON stock_requests(warehouse);
CREATE INDEX IF NOT EXISTS idx_stock_requests_status ON stock_requests(status);
CREATE INDEX IF NOT EXISTS idx_stock_requests_created_at ON stock_requests(created_at DESC);
