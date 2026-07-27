-- ============================================================
-- Records which bin a stock_history entry actually happened at (the bin
-- selected in Purchases/Transfers/Deliveries/Returns/Requests/Orders/Adjust
-- Stock) — lets the Full Ledger show "which bin" instead of just the total
-- quantity change.
-- ============================================================

ALTER TABLE stock_history ADD COLUMN IF NOT EXISTS bin_location text;
