import type { Order } from '@/mocks/orders';
import type { ProductStockRow } from '@/mocks/inventory';
import { nowStamp } from '@/lib/timestamp';

export interface OrderLineDraft {
  productId: string;
  quantity: number | '';
  /** Which warehouse's stock of this product this line ships from — a product can
   * now be stocked in more than one warehouse, so this (not just productId) is what
   * picks the specific product_warehouse_stock row a line refers to. */
  warehouse?: string;
  /** Which bin this line ships from, when the product has more than one. */
  binLocation?: string;
}

export interface OrderCreateDraft {
  requestedBy: string;
  customer: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  notes: string;
  lines: OrderLineDraft[];
}

/** Maps one row of a `product_warehouse_stock` (joined to its `products` master) query
 * into the flat per-(product, warehouse) shape the order picker works with. */
export function mapProductRow(row: Record<string, unknown>): ProductStockRow {
  const product = (row.product ?? row) as Record<string, unknown>;
  return {
    id: product.id as string,
    name: product.name as string,
    sku: product.sku as string,
    category: product.category as string,
    imageUrl: (product.image_url as string | undefined) || (product.imageUrl as string | undefined),
    price: product.price as number,
    productType: (product.product_type as ProductStockRow['productType']) || 'piece',
    lastUpdated: (product.last_updated as string) || '',
    stockRowId: row.id as string,
    warehouse: row.warehouse as string,
    vendor: (row.vendor as string) || undefined,
    stock: row.stock as number,
    onHoldStock: (row.on_hold_stock as number) ?? 0,
    lowStockThreshold: row.low_stock_threshold as number,
    status: row.status as ProductStockRow['status'],
    expiryDate: (row.expiry_date as string) || undefined,
    binLocation: (row.bin_location as string) || undefined,
  };
}

function buildVendorSplits(draft: OrderCreateDraft, products: ProductStockRow[]) {
  const selectedLines = draft.lines
    .map((line) => ({ ...line, quantity: Number(line.quantity) || 0, product: products.find((p) => p.id === line.productId && p.warehouse === line.warehouse) }))
    .filter((line): line is { productId: string; quantity: number; warehouse?: string; binLocation?: string; product: ProductStockRow } => Boolean(line.product) && line.quantity > 0);

  const itemCount = selectedLines.reduce((sum, line) => sum + line.quantity, 0);
  const total = selectedLines.reduce((sum, line) => sum + line.quantity * line.product.price, 0);
  const grouped = new Map<string, typeof selectedLines>();

  selectedLines.forEach((line) => {
    const vendor = line.product.vendor || line.product.warehouse;
    grouped.set(vendor, [...(grouped.get(vendor) || []), line]);
  });

  const vendorSplits = Array.from(grouped.entries()).map(([vendor, lines], splitIndex) => ({
    vendor,
    warehouse: lines[0].product.warehouse,
    status: 'pending',
    subtotal: lines.reduce((sum, line) => sum + line.quantity * line.product.price, 0),
    items: lines.map((line, itemIndex) => ({
      id: `OI-${Date.now()}-${splitIndex}-${itemIndex}`,
      productId: line.product.id,
      productName: line.product.name,
      sku: line.product.sku,
      imageUrl: line.product.imageUrl || null,
      quantity: line.quantity,
      unitPrice: line.product.price,
      availableQty: line.product.stock,
      vendor,
      warehouse: line.product.warehouse,
      status: 'pending',
      binLocation: line.binLocation,
    })),
  }));

  return { itemCount, total, vendorSplits };
}

export function buildOrderInsert(draft: OrderCreateDraft, products: ProductStockRow[]) {
  const now = nowStamp();
  const { itemCount, total, vendorSplits } = buildVendorSplits(draft, products);

  return {
    id: `ORD-${Date.now()}`,
    requested_by: draft.requestedBy.trim(),
    customer: draft.customer.trim(),
    email: draft.email.trim(),
    phone: draft.phone.trim(),
    address: draft.address.trim(),
    city: draft.city.trim(),
    created_at: now,
    updated_at: now,
    status: 'pending',
    total,
    item_count: itemCount,
    vendor_splits: vendorSplits,
    notes: draft.notes.trim() || null,
  };
}

export function mapOrderToDraft(order: Order): OrderCreateDraft {
  const lines = order.vendorSplits.flatMap((split) =>
    split.items.map((item) => ({ productId: item.productId, quantity: item.quantity, warehouse: item.warehouse, binLocation: item.binLocation }))
  );

  return {
    requestedBy: order.requestedBy ?? '',
    customer: order.customer,
    email: order.email,
    phone: order.phone,
    address: order.address,
    city: order.city,
    notes: order.notes ?? '',
    lines,
  };
}

export function buildOrderUpdate(draft: OrderCreateDraft, products: ProductStockRow[]) {
  const now = nowStamp();
  const { itemCount, total, vendorSplits } = buildVendorSplits(draft, products);

  return {
    requested_by: draft.requestedBy.trim(),
    customer: draft.customer.trim(),
    email: draft.email.trim(),
    phone: draft.phone.trim(),
    address: draft.address.trim(),
    city: draft.city.trim(),
    updated_at: now,
    status: 'pending',
    total,
    item_count: itemCount,
    vendor_splits: vendorSplits,
    notes: draft.notes.trim() || null,
  };
}
