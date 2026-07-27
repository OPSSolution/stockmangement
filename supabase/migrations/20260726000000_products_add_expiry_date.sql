-- Expiry date for incoming stock — captured when a new product is added with
-- initial stock, or when existing stock is keyed in via Adjust Stock (Stock
-- Received / Transfer In). Tracked per product (the current/latest batch) and
-- per stock_history entry (so earlier batches' dates aren't lost from the trail).
ALTER TABLE products ADD COLUMN IF NOT EXISTS expiry_date date;
ALTER TABLE stock_history ADD COLUMN IF NOT EXISTS expiry_date date;
