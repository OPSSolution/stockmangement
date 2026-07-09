-- ============================================================
-- Stock Requests — separate "who is asking for stock" (requested_by,
-- free text) from "who logged this into the system" (submitted_by,
-- used for edit/cancel ownership checks).
-- ============================================================

ALTER TABLE stock_requests ADD COLUMN IF NOT EXISTS submitted_by text;

-- Backfill: existing rows had requested_by set to the logged-in user's
-- identity, which is exactly what submitted_by now represents.
UPDATE stock_requests SET submitted_by = requested_by WHERE submitted_by IS NULL;
