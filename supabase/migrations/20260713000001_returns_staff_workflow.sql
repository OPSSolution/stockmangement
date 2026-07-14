-- Returns become a purely internal, staff stock-return workflow (borrow ->
-- use -> return to stock), not a customer e-commerce return. Every return is
-- now tied to the Stock Request it came from, with no customer/refund
-- concept. The "customer" column is kept and repurposed by the app to hold
-- the staff member's name ("Returned By") instead of being renamed/dropped,
-- so no historical data is lost.

-- Old customer-identity/refund fields are no longer required or written to
-- by the app — relaxed rather than dropped, so nothing is lost.
ALTER TABLE returns ALTER COLUMN order_id DROP NOT NULL;
ALTER TABLE returns ALTER COLUMN customer DROP NOT NULL;
ALTER TABLE returns ALTER COLUMN refund_method DROP NOT NULL;
ALTER TABLE returns ALTER COLUMN refund_method DROP DEFAULT;

-- Drop the old constraints before touching existing rows so they don't
-- reject values the new constraints won't allow.
ALTER TABLE returns DROP CONSTRAINT IF EXISTS returns_reason_check;
ALTER TABLE returns DROP CONSTRAINT IF EXISTS returns_status_check;

-- Migrate existing rows off retired reason/status values.
UPDATE returns SET reason = 'damaged' WHERE reason = 'defective';
UPDATE returns SET reason = 'other' WHERE reason NOT IN ('photoshoot', 'excess', 'damaged', 'consignment', 'other');
UPDATE returns SET status = 'restocked' WHERE status IN ('refunded', 'returned');

-- Reasons switch from customer language to internal staff-return reasons.
ALTER TABLE returns ADD CONSTRAINT returns_reason_check
  CHECK (reason IN ('photoshoot', 'excess', 'damaged', 'consignment', 'other'));

-- Statuses drop 'refunded' (no money changes hands internally) and 'returned'
-- (that concept now lives at the request level, tracked by quantity progress
-- across all its returns, not by a single return's own status).
ALTER TABLE returns ADD CONSTRAINT returns_status_check
  CHECK (status IN ('pending', 'inspecting', 'approved', 'restocked', 'discarded'));
