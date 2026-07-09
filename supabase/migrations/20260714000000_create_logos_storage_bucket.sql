-- ============================================================
-- Logos storage bucket — request-template company logos are
-- uploaded here as real files instead of being embedded as base64
-- text in the database; the DB only stores the resulting public URL.
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('logos', 'logos', true)
ON CONFLICT (id) DO NOTHING;

-- Matches the permissive "allow all" policy style already used by every
-- other table in this project (access is gated in the app layer, not RLS).
CREATE POLICY "Public read access for logos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'logos');

CREATE POLICY "Allow uploads to logos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'logos');

CREATE POLICY "Allow updates to logos"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'logos');

CREATE POLICY "Allow deletes to logos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'logos');
