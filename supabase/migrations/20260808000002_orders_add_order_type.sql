-- Orders can now be created as a lightweight "Quick Order" (products + a note,
-- no customer contact details) alongside the existing full-detail flow, renamed
-- "Regular Order" in the UI. Both go through the same approve → confirm
-- shipment pipeline afterwards — this column only distinguishes how they were
-- created.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_type text NOT NULL DEFAULT 'regular' CHECK (order_type IN ('regular', 'quick'));

-- Defensive: orderCreateUtils.ts has always written `requested_by` on create/update,
-- but no earlier migration actually added this column to `orders` (unlike its
-- siblings on transfers/purchases/stock_requests) — add it now so both order
-- types can record who created them.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS requested_by text;
