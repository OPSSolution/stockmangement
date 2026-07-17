ALTER TABLE stock_history DROP CONSTRAINT IF EXISTS stock_history_type_check;

ALTER TABLE stock_history ADD CONSTRAINT stock_history_type_check
  CHECK (type IN ('sale', 'purchase', 'transfer_in', 'transfer_out', 'return', 'adjustment', 'request'));

-- Reclassify historical rows that were logged as 'adjustment' by the request-approval
-- flow before it was given its own type — identifiable by their REQ- reference.
UPDATE stock_history SET type = 'request'
  WHERE type = 'adjustment' AND reference LIKE 'REQ-%';
