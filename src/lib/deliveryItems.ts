import type { DeliveryItem } from '@/mocks/deliveries';

/**
 * Delivery items are stored as pipe-delimited lines in the items_detail text column
 * (productName|sku|quantity|imageUrl|productId) rather than a structured jsonb array —
 * shared here so both the deliveries page and the stock-reservation utility decode it
 * the same way.
 */
export function parseDeliveryItems(row: any): DeliveryItem[] {
  if (Array.isArray(row.items)) return row.items;
  if (Array.isArray(row.items_detail)) return row.items_detail;
  if (typeof row.items_detail !== 'string') return [];

  return row.items_detail
    .split('\n')
    .map((line: string) => {
      const [productName = '', sku = '', rawQuantity = '1', imageUrl = '', productId = ''] = line.split('|');
      return { productName, sku, quantity: Number(rawQuantity) || 1, imageUrl: imageUrl || null, productId: productId || undefined };
    })
    .filter((item: DeliveryItem) => item.productName || item.sku);
}

export function deliveryItemsToDetail(items: DeliveryItem[]) {
  return items.map((item) => `${item.productName}|${item.sku}|${item.quantity}|${item.imageUrl || ''}|${item.productId || ''}`).join('\n');
}
