-- ============================================================
-- Link Requests <-> Returns — a stock request can be flagged as
-- "may need to be returned later" at creation time; a Return can
-- then reference that request directly, and completing the return
-- marks the original request as returned.
-- ============================================================

ALTER TABLE stock_requests ADD COLUMN IF NOT EXISTS needs_return boolean NOT NULL DEFAULT false;

ALTER TABLE returns ADD COLUMN IF NOT EXISTS request_id text REFERENCES stock_requests(id) ON DELETE SET NULL;
