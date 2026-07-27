-- ============================================================
-- Receipt sign-off for stock requests, and shipment confirmation +
-- receipt sign-off for orders — the pickslip itself is already
-- covered by the existing PDF export. Requests skip the shipment
-- leg: stock is picked up directly, there's nothing in transit.
-- ============================================================

ALTER TABLE stock_requests ADD COLUMN IF NOT EXISTS received_at timestamptz;
ALTER TABLE stock_requests ADD COLUMN IF NOT EXISTS received_by text;
ALTER TABLE stock_requests ADD COLUMN IF NOT EXISTS receipt_confirmed boolean NOT NULL DEFAULT false;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipped_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipped_by text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipment_note text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS received_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS received_by text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS receipt_confirmed boolean NOT NULL DEFAULT false;
