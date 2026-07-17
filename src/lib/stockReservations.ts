import { supabase } from './supabase';
import { parseDeliveryItems } from './deliveryItems';

/**
 * Requests, Orders, outbound Transfers, and Deliveries all promise away stock
 * before it's physically deducted (only a Transfer reaching 'received', a
 * Delivery reaching 'delivered' — or a manual inventory adjustment — actually
 * changes products.stock today). This sums the quantities tied up in every
 * not-yet-final record for each product, so callers can compute
 * `available = product.stock - reserved[product.id]` and stop new
 * requests/orders/transfers/deliveries from over-committing the same units.
 *
 * Every item references a product row that's already warehouse-specific
 * (products are unique per sku+warehouse), so summing by productId alone is
 * enough — no separate warehouse filter is needed.
 */

interface ReservationExclusions {
  /** Editing this request shouldn't count its own not-yet-saved items against itself. */
  excludeRequestId?: string;
  excludeOrderId?: string;
  excludeTransferId?: string;
  excludeDeliveryId?: string;
}

type LineItem = { productId?: string; quantity?: number };

function sumInto(reserved: Record<string, number>, items: LineItem[] | null | undefined) {
  (items || []).forEach((item) => {
    if (!item?.productId || !item.quantity) return;
    reserved[item.productId] = (reserved[item.productId] || 0) + item.quantity;
  });
}

export async function getReservedQuantities(exclude: ReservationExclusions = {}): Promise<Record<string, number>> {
  const reserved: Record<string, number> = {};

  // Requests: stock is deducted the moment a request is approved, so only
  // 'pending' ones are still just a promise against real stock — an 'approved'
  // request is already baked into products.stock and must not be counted here too.
  const [{ data: requests }, { data: orders }, { data: transfers }, { data: deliveries }] = await Promise.all([
    supabase.from('stock_requests').select('id, items').eq('status', 'pending'),
    supabase.from('orders').select('id, vendor_splits').in('status', ['pending', 'accepted', 'partial', 'processing']),
    supabase.from('transfers').select('id, items').in('status', ['requested', 'approved', 'in_transit']),
    supabase.from('deliveries').select('id, items_detail').in('status', ['prepare', 'ready', 'in_transit']),
  ]);

  (requests || [])
    .filter((r) => r.id !== exclude.excludeRequestId)
    .forEach((r) => sumInto(reserved, r.items as LineItem[]));

  // Orders decide per line item — an 'accepted' item is deducted immediately on
  // confirm (see OrderDetailModal.handleConfirm), so only still-'pending' items
  // (including the undecided remainder of a 'partial' order) are still just reserved.
  (orders || [])
    .filter((o) => o.id !== exclude.excludeOrderId)
    .forEach((o) => {
      ((o.vendor_splits as { items?: (LineItem & { status?: string })[] }[]) || []).forEach((split) =>
        sumInto(reserved, (split.items || []).filter((i) => i.status === 'pending'))
      );
    });

  (transfers || [])
    .filter((t) => t.id !== exclude.excludeTransferId)
    .forEach((t) => sumInto(reserved, t.items as LineItem[]));

  (deliveries || [])
    .filter((d) => d.id !== exclude.excludeDeliveryId)
    .forEach((d) => sumInto(reserved, parseDeliveryItems(d)));

  return reserved;
}

/**
 * Non-negative units of a product not already promised to another pending
 * request/order/transfer, and not sitting on hold (damaged/unusable returns —
 * counted in `stock` but never requestable/sellable until someone resolves them).
 */
export function availableStock(stock: number, reserved: Record<string, number>, productId: string, onHoldStock = 0): number {
  return Math.max(0, stock - (reserved[productId] || 0) - onHoldStock);
}

export interface ReservationDetail {
  source: 'Request' | 'Order' | 'Transfer' | 'Delivery';
  id: string;
  status: string;
  quantity: number;
}

function qtyForProduct(items: LineItem[] | null | undefined, productId: string): number {
  return (items || []).reduce((sum, item) => (item?.productId === productId ? sum + (item.quantity || 0) : sum), 0);
}

/** Per-record breakdown of what's holding a specific product's reserved quantity — which request/order/transfer/delivery, at what status, for how much. */
export async function getReservationDetailsForProduct(productId: string): Promise<ReservationDetail[]> {
  const details: ReservationDetail[] = [];

  const [{ data: requests }, { data: orders }, { data: transfers }, { data: deliveries }] = await Promise.all([
    supabase.from('stock_requests').select('id, items, status').eq('status', 'pending'),
    supabase.from('orders').select('id, vendor_splits, status').in('status', ['pending', 'accepted', 'partial', 'processing']),
    supabase.from('transfers').select('id, items, status').in('status', ['requested', 'approved', 'in_transit']),
    supabase.from('deliveries').select('id, items_detail, status').in('status', ['prepare', 'ready', 'in_transit']),
  ]);

  (requests || []).forEach((r) => {
    const quantity = qtyForProduct(r.items as LineItem[], productId);
    if (quantity > 0) details.push({ source: 'Request', id: r.id, status: r.status, quantity });
  });

  (orders || []).forEach((o) => {
    const pendingItems = ((o.vendor_splits as { items?: (LineItem & { status?: string })[] }[]) || [])
      .flatMap((split) => (split.items || []).filter((i) => i.status === 'pending'));
    const quantity = qtyForProduct(pendingItems, productId);
    if (quantity > 0) details.push({ source: 'Order', id: o.id, status: o.status, quantity });
  });

  (transfers || []).forEach((t) => {
    const quantity = qtyForProduct(t.items as LineItem[], productId);
    if (quantity > 0) details.push({ source: 'Transfer', id: t.id, status: t.status, quantity });
  });

  (deliveries || []).forEach((d) => {
    const quantity = qtyForProduct(parseDeliveryItems(d), productId);
    if (quantity > 0) details.push({ source: 'Delivery', id: d.id, status: d.status, quantity });
  });

  return details;
}
