-- ============================================================
-- Requests now require a referral document attachment, and pending
-- requests need an explicit admin (or approve-permitted role) decision
-- rather than any submitter being able to self-approve. The rejection
-- reason reuses the existing review_note column.
-- ============================================================

ALTER TABLE stock_requests
  ADD COLUMN IF NOT EXISTS referral_document_url TEXT,
  ADD COLUMN IF NOT EXISTS referral_document_name TEXT;

-- Storage bucket for request referral documents (photos, purchase orders, etc.),
-- following the same public-bucket / app-layer-gated pattern as the logos bucket.
INSERT INTO storage.buckets (id, name, public)
VALUES ('request_documents', 'request_documents', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read access for request_documents" ON storage.objects;
CREATE POLICY "Public read access for request_documents"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'request_documents');

DROP POLICY IF EXISTS "Allow uploads to request_documents" ON storage.objects;
CREATE POLICY "Allow uploads to request_documents"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'request_documents');

DROP POLICY IF EXISTS "Allow updates to request_documents" ON storage.objects;
CREATE POLICY "Allow updates to request_documents"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'request_documents');

DROP POLICY IF EXISTS "Allow deletes to request_documents" ON storage.objects;
CREATE POLICY "Allow deletes to request_documents"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'request_documents');
