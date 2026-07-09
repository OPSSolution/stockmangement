-- ============================================================
-- Returns — allow 'returned' as a status, used to mark a
-- request-linked return complete (distinct from the customer-return
-- states restocked/discarded/refunded).
-- ============================================================

ALTER TABLE returns DROP CONSTRAINT IF EXISTS returns_status_check;
ALTER TABLE returns ADD CONSTRAINT returns_status_check
  CHECK (status IN ('pending', 'inspecting', 'approved', 'restocked', 'discarded', 'refunded', 'returned'));
