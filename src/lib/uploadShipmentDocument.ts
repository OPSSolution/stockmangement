import { supabase } from './supabase';

/**
 * Uploads a confirmation document (delivery note, signed handover, photo, etc.)
 * to the shared shipment_documents bucket — backs every step where stock is
 * only allowed to move once a physical confirmation is attached: Purchases'
 * Confirm Receipt, Transfers' Confirm Received, Returns' Confirm/restock,
 * Orders' Confirm Shipment, and Requests' Confirm Dispatch.
 */
export async function uploadShipmentDocument(file: File): Promise<{ url: string | null; error: string | null }> {
  const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
  const path = `${Date.now()}-${safeName}`;
  const { error: uploadError } = await supabase.storage.from('shipment_documents').upload(path, file, { cacheControl: '3600', upsert: true });
  if (uploadError) return { url: null, error: uploadError.message };

  const { data } = supabase.storage.from('shipment_documents').getPublicUrl(path);
  return { url: data.publicUrl, error: null };
}
