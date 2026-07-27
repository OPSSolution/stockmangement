import { supabase } from './supabase';

/**
 * Uploads a supporting document (campaign brief, approval memo, banner
 * artwork, etc.) attached to a promotion at creation time, to the dedicated
 * promotion_documents bucket.
 */
export async function uploadPromotionDocument(file: File): Promise<{ url: string | null; error: string | null }> {
  const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
  const path = `${Date.now()}-${safeName}`;
  const { error: uploadError } = await supabase.storage.from('promotion_documents').upload(path, file, { cacheControl: '3600', upsert: true });
  if (uploadError) return { url: null, error: uploadError.message };

  const { data } = supabase.storage.from('promotion_documents').getPublicUrl(path);
  return { url: data.publicUrl, error: null };
}
