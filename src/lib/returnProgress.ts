import { supabase } from './supabase';

export type ReturnQtyMap = Record<string, number>;

function sumItemsByProduct(rows: { items: unknown }[]): ReturnQtyMap {
  const map: ReturnQtyMap = {};
  for (const row of rows) {
    const items = (row.items as { productId: string; quantity: number }[]) || [];
    for (const item of items) {
      map[item.productId] = (map[item.productId] || 0) + Number(item.quantity || 0);
    }
  }
  return map;
}

/**
 * Per-product quantities already committed to a return linked to this request,
 * across every return regardless of its own status — a request can receive
 * several partial returns over time, and units claimed by an earlier return
 * (even one still pending/inspecting) must not be selectable again in a new one.
 */
export async function getClaimedReturnQuantities(requestId: string, excludeReturnId?: string): Promise<ReturnQtyMap> {
  const { data, error } = await supabase.from('returns').select('id, items').eq('request_id', requestId);
  if (error || !data) return {};
  return sumItemsByProduct(data.filter((row) => row.id !== excludeReturnId));
}

/**
 * Per-product quantities from returns that have reached a terminal state —
 * restocked (put back into usable stock) or discarded (disposed of) — used to
 * decide whether the parent request is fully closed out. Either outcome means
 * the units are resolved and off the requester's hands.
 */
export async function getCompletedReturnQuantities(requestId: string): Promise<ReturnQtyMap> {
  const { data, error } = await supabase.from('returns').select('items').eq('request_id', requestId).in('status', ['restocked', 'discarded']);
  if (error || !data) return {};
  return sumItemsByProduct(data);
}
