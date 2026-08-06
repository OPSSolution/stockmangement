-- Quick Order now captures how the customer paid — Cash and/or QR (both can be
-- checked for a split payment). Two booleans rather than an enum/array since
-- either, both, or neither can be true.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_cash boolean NOT NULL DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_qr boolean NOT NULL DEFAULT false;
