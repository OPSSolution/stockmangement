-- ============================================================
-- Stock Requests — bring the digital form in line with the paper
-- "Requested Form" used in-store: reference number, date of receive,
-- per-item package weight/unit (used to compute Total-Kg), checkbox-style
-- reasons, and the multi-step signature chain (Requested by / Reviewed by x2
-- / Approved by).
-- ============================================================

ALTER TABLE stock_requests ADD COLUMN IF NOT EXISTS reference text;
ALTER TABLE stock_requests ADD COLUMN IF NOT EXISTS date_of_receive date;
ALTER TABLE stock_requests ADD COLUMN IF NOT EXISTS reason_tags text[] NOT NULL DEFAULT '{}';
ALTER TABLE stock_requests ADD COLUMN IF NOT EXISTS total_kg numeric(10, 2) NOT NULL DEFAULT 0;

-- Second reviewer + approver, matching the paper form's four signature
-- boxes (Requested by / Reviewed by / Reviewed by / Approved by).
-- `reviewed_by` + a new `reviewed_at` cover the first reviewer.
ALTER TABLE stock_requests ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
ALTER TABLE stock_requests ADD COLUMN IF NOT EXISTS reviewed_by_2 text;
ALTER TABLE stock_requests ADD COLUMN IF NOT EXISTS reviewed_at_2 timestamptz;
ALTER TABLE stock_requests ADD COLUMN IF NOT EXISTS approved_by text;
ALTER TABLE stock_requests ADD COLUMN IF NOT EXISTS approved_at timestamptz;
