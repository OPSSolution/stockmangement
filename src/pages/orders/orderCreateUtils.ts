import type { Order } from '@/mocks/orders';
import type { Product } from '@/mocks/inventory';

export interface OrderLineDraft {
  productId: string;
  quantity: number | '';
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

export function mapProductRow(row: Record<string, unknown>): Product {
  return {
    id: row.id as string,
    name: row.name as string,
    sku: row.sku as string,
    category: row.category as string,
    warehouse: row.warehouse as Product['warehouse'],
    vendor: row.vendor as string | undefined,
    imageUrl: (row.image_url as string | undefined) || (row.imageUrl as string | undefined),
    stock: row.stock as number,
    lowStockThreshold: row.low_stock_threshold as number,
    price: row.price as number,
    productType: (row.product_type as Product['productType']) || 'piece',
    status: row.status as Product['status'],
    lastUpdated: row.last_updated as string,
  };
}

export function buildOrderInsert(draft: OrderCreateDraft, products: Product[]) {
  const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const selectedLines = draft.lines
    .map((line) => ({ ...line, quantity: Number(line.quantity) || 0, product: products.find((p) => p.id === line.productId) }))
    .filter((line): line is { productId: string; quantity: number; product: Product } => Boolean(line.product) && line.quantity > 0);

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
    })),
  }));

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
    split.items.map((item) => ({ productId: item.productId, quantity: item.quantity }))
  );

  return {
    requestedBy: order.requestedBy ?? '',
    customer: order.customer,
    email: order.email,
    phone: order.phone,
    address: order.address,
    city: order.city,
    notes: order.notes ?? '',
    lines: lines.length > 0 ? lines : [{ productId: '', quantity: 1 }],
  };
}

export function buildOrderUpdate(draft: OrderCreateDraft, products: Product[]) {
  const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const selectedLines = draft.lines
    .map((line) => ({ ...line, quantity: Number(line.quantity) || 0, product: products.find((p) => p.id === line.productId) }))
    .filter((line): line is { productId: string; quantity: number; product: Product } => Boolean(line.product) && line.quantity > 0);

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
    })),
  }));

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
