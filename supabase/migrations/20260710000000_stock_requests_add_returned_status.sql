-- ============================================================
-- Stock Requests — support marking a fulfilled request as
-- "returned" (staff handing the stock back), with a reason.
-- ============================================================

ALTER TABLE stock_requests DROP CONSTRAINT IF EXISTS stock_requests_status_check;
ALTER TABLE stock_requests ADD CONSTRAINT stock_requests_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'fulfilled', 'cancelled', 'returned'));

ALTER TABLE stock_requests ADD COLUMN IF NOT EXISTS return_reason text;
