-- ============================================================
-- Stock must never move on approval alone — only once someone
-- confirms the physical movement actually happened, backed by an
-- uploaded document (delivery note, signed handover, photo, etc.).
--
-- Purchases, Transfers and Returns already deferred their stock
-- change to a final confirmation step (Confirm Receipt / Confirm
-- Received / Restock) — these just gain a required document column.
--
-- Orders previously deducted stock at the Accept decision, before
-- shipment — shipment_document_* now backs the Confirm Shipment step,
-- which is where the deduction moves to.
--
-- Stock Requests previously deducted stock at Approve (bundled with
-- the referral document). Approve is now a pure decision; a new
-- Confirm Dispatch step (dispatched_*) is what deducts stock.
-- ============================================================

ALTER TABLE purchases ADD COLUMN IF NOT EXISTS receipt_document_url text;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS receipt_document_name text;

ALTER TABLE transfers ADD COLUMN IF NOT EXISTS receipt_document_url text;
ALTER TABLE transfers ADD COLUMN IF NOT EXISTS receipt_document_name text;

ALTER TABLE returns ADD COLUMN IF NOT EXISTS restock_document_url text;
ALTER TABLE returns ADD COLUMN IF NOT EXISTS restock_document_name text;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipment_document_url text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipment_document_name text;

ALTER TABLE stock_requests ADD COLUMN IF NOT EXISTS dispatched_at timestamptz;
ALTER TABLE stock_requests ADD COLUMN IF NOT EXISTS dispatched_by text;
ALTER TABLE stock_requests ADD COLUMN IF NOT EXISTS dispatch_document_url text;
ALTER TABLE stock_requests ADD COLUMN IF NOT EXISTS dispatch_document_name text;

-- Shared storage bucket for all shipment/receipt/restock/dispatch confirmation
-- documents, following the same public-bucket / app-layer-gated pattern as
-- request_documents.
INSERT INTO storage.buckets (id, name, public)
VALUES ('shipment_documents', 'shipment_documents', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read access for shipment_documents" ON storage.objects;
CREATE POLICY "Public read access for shipment_documents"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'shipment_documents');

DROP POLICY IF EXISTS "Allow uploads to shipment_documents" ON storage.objects;
CREATE POLICY "Allow uploads to shipment_documents"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'shipment_documents');

DROP POLICY IF EXISTS "Allow updates to shipment_documents" ON storage.objects;
CREATE POLICY "Allow updates to shipment_documents"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'shipment_documents');

DROP POLICY IF EXISTS "Allow deletes to shipment_documents" ON storage.objects;
CREATE POLICY "Allow deletes to shipment_documents"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'shipment_documents');
