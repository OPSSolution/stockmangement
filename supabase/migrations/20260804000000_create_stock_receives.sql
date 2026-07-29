-- ============================================================
-- Stock Receives — a standalone record of stock coming into a warehouse
-- (e.g. an informal supplier drop-off, a restock with no PO behind it).
-- Deliberately separate from `purchases`: a purchase order is an approval
-- workflow that *ends* in a receipt; a stock receive has no workflow at
-- all — creating one immediately applies the stock, same as "Stock
-- Received" used to on Adjust Stock, just multi-product in one go.
-- ============================================================

CREATE TABLE IF NOT EXISTS stock_receives (
  id text PRIMARY KEY,
  warehouse text NOT NULL,
  vendor text,
  reference text,
  notes text,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_items integer NOT NULL DEFAULT 0,
  received_by text NOT NULL,
  created_at text NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI')
);

ALTER TABLE stock_receives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read stock_receives"
  ON stock_receives FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Staff and admin can modify stock_receives"
  ON stock_receives FOR ALL
  USING (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'staff')));

CREATE INDEX IF NOT EXISTS idx_stock_receives_created_at ON stock_receives(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_receives_warehouse ON stock_receives(warehouse);
