-- ============================================================
-- Promotions can now have a supporting document attached at creation
-- (campaign brief, approval memo, banner artwork, etc.) — stored as a
-- real file, following the same public-bucket / app-layer-gated
-- pattern as logos and request_documents.
-- ============================================================

ALTER TABLE promotions
  ADD COLUMN IF NOT EXISTS document_url TEXT,
  ADD COLUMN IF NOT EXISTS document_name TEXT;

INSERT INTO storage.buckets (id, name, public)
VALUES ('promotion_documents', 'promotion_documents', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read access for promotion_documents" ON storage.objects;
CREATE POLICY "Public read access for promotion_documents"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'promotion_documents');

DROP POLICY IF EXISTS "Allow uploads to promotion_documents" ON storage.objects;
CREATE POLICY "Allow uploads to promotion_documents"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'promotion_documents');

DROP POLICY IF EXISTS "Allow updates to promotion_documents" ON storage.objects;
CREATE POLICY "Allow updates to promotion_documents"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'promotion_documents');

DROP POLICY IF EXISTS "Allow deletes to promotion_documents" ON storage.objects;
CREATE POLICY "Allow deletes to promotion_documents"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'promotion_documents');
