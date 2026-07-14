import { supabase } from '@/lib/supabase';
import { type Warehouse } from '@/mocks/warehouses';

export const zoneTypeConfig: Record<string, { color: string; label: string }> = {
  storage: { color: 'bg-emerald-500', label: 'Storage' },
  receiving: { color: 'bg-sky-500', label: 'Receiving' },
  shipping: { color: 'bg-violet-500', label: 'Shipping' },
  returns: { color: 'bg-amber-400', label: 'Returns' },
  staging: { color: 'bg-orange-400', label: 'Staging' },
};

export const shiftColor = { morning: 'bg-amber-100 text-amber-700', evening: 'bg-violet-100 text-violet-700', night: 'bg-gray-200 text-gray-600' };

const TRANSFER_OPEN = ['requested', 'approved', 'in_transit'];
const PURCHASE_OPEN = ['submitted', 'approved', 'ordered'];
const RETURN_OPEN = ['pending', 'inspecting', 'approved'];

export interface LiveStats {
  stockValue: number;
  lowStockCount: number;
  outOfStockCount: number;
  pendingTransfersIn: number;
  pendingTransfersOut: number;
  pendingPurchases: number;
  purchasesValue: number;
  activeReturns: number;
}

export const emptyLiveStats: LiveStats = {
  stockValue: 0, lowStockCount: 0, outOfStockCount: 0,
  pendingTransfersIn: 0, pendingTransfersOut: 0,
  pendingPurchases: 0, purchasesValue: 0, activeReturns: 0,
};

function mapWarehouse(row: Record<string, unknown>): Warehouse {
  return {
    id: row.id as string,
    name: row.name as string,
    type: row.type as Warehouse['type'],
    city: row.city as string,
    address: row.address as string,
    manager: row.manager as string,
    managerEmail: row.manager_email as string,
    managerPhone: row.manager_phone as string,
    operatingHours: row.operating_hours as string,
    totalCapacity: row.total_capacity as number,
    usedCapacity: row.used_capacity as number,
    totalSkus: row.total_skus as number,
    totalUnits: row.total_units as number,
    inboundToday: row.inbound_today as number,
    outboundToday: row.outbound_today as number,
    lastAudit: row.last_audit as string,
    notes: row.notes as string | undefined,
    zones: (row.zones as unknown as Warehouse['zones']) || [],
    staff: (row.staff as unknown as Warehouse['staff']) || [],
    monthlyActivity: (row.monthly_activity as unknown as Warehouse['monthlyActivity']) || [],
    country: (row.country as string) || 'Malaysia',
    pendingPickups: (row.pending_pickups as number) || 0,
    vendorNames: (row.vendor_names as string[]) || [],
  };
}

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const monthLabel = (d: Date) => d.toLocaleDateString('en-US', { month: 'short' });

// Fetches warehouses plus real product/transfer/purchase/return data, and derives
// live per-warehouse stats — replacing the static seeded totals on the warehouses
// table with numbers that reflect what's actually happening right now.
export async function fetchWarehousesWithLiveData(
  scopeWarehouseNames?: string[] | null
): Promise<{ warehouses: Warehouse[]; liveStats: Record<string, LiveStats> } | null> {
  let warehousesQuery = supabase.from('warehouses').select('*');
  if (scopeWarehouseNames && scopeWarehouseNames.length > 0) warehousesQuery = warehousesQuery.in('name', scopeWarehouseNames);

  const [
    { data: whRows, error },
    { data: products },
    { data: transfers },
    { data: purchases },
    { data: returns },
  ] = await Promise.all([
    warehousesQuery,
    supabase.from('products').select('warehouse, stock, price, status'),
    supabase.from('transfers').select('from_warehouse, to_warehouse, status, total_items, created_at'),
    supabase.from('purchases').select('warehouse, status, total, created_at'),
    supabase.from('returns').select('warehouse, status, created_at'),
  ]);

  if (error) {
    console.error(error);
    return null;
  }

  const mapped = (whRows || []).map(mapWarehouse);

  const today = new Date().toISOString().slice(0, 10);
  const last6Months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - (5 - i));
    return { key: monthKey(d), label: monthLabel(d) };
  });

  const withLiveData = mapped.map((w) => {
    const wProducts = (products || []).filter((p: any) => p.warehouse === w.name);
    const totalUnits = wProducts.reduce((s: number, p: any) => s + Number(p.stock || 0), 0);

    const transfersIn = (transfers || []).filter((t: any) => t.to_warehouse === w.name);
    const transfersOut = (transfers || []).filter((t: any) => t.from_warehouse === w.name);
    const inboundToday = transfersIn.filter((t: any) => String(t.created_at).startsWith(today)).length;
    const outboundToday = transfersOut.filter((t: any) => String(t.created_at).startsWith(today)).length;

    const wPurchases = (purchases || []).filter((p: any) => p.warehouse === w.name);
    const wReturns = (returns || []).filter((r: any) => r.warehouse === w.name);

    const monthlyActivity = last6Months.map(({ key, label }) => ({
      month: label,
      inbound: transfersIn.filter((t: any) => String(t.created_at).startsWith(key)).length,
      outbound: transfersOut.filter((t: any) => String(t.created_at).startsWith(key)).length,
      returns: wReturns.filter((r: any) => String(r.created_at).startsWith(key)).length,
    }));

    const extra: LiveStats = {
      stockValue: wProducts.reduce((s: number, p: any) => s + Number(p.stock || 0) * Number(p.price || 0), 0),
      lowStockCount: wProducts.filter((p: any) => p.status === 'low_stock').length,
      outOfStockCount: wProducts.filter((p: any) => p.status === 'out_of_stock').length,
      pendingTransfersIn: transfersIn.filter((t: any) => TRANSFER_OPEN.includes(t.status)).length,
      pendingTransfersOut: transfersOut.filter((t: any) => TRANSFER_OPEN.includes(t.status)).length,
      pendingPurchases: wPurchases.filter((p: any) => PURCHASE_OPEN.includes(p.status)).length,
      purchasesValue: wPurchases.filter((p: any) => PURCHASE_OPEN.includes(p.status)).reduce((s: number, p: any) => s + Number(p.total || 0), 0),
      activeReturns: wReturns.filter((r: any) => RETURN_OPEN.includes(r.status)).length,
    };

    return {
      warehouse: {
        ...w,
        totalSkus: wProducts.length,
        totalUnits,
        usedCapacity: totalUnits,
        inboundToday,
        outboundToday,
        pendingPickups: extra.pendingPurchases,
        monthlyActivity,
      } as Warehouse,
      extra,
    };
  });

  return {
    warehouses: withLiveData.map((x) => x.warehouse),
    liveStats: Object.fromEntries(withLiveData.map((x) => [x.warehouse.name, x.extra])),
  };
}

export interface WarehouseProductRow {
  id: string;
  name: string;
  sku: string;
  category: string;
  vendor: string | null;
  stock: number;
  low_stock_threshold: number;
  price: number;
  status: 'in_stock' | 'low_stock' | 'out_of_stock';
}

export type ActivityKind = 'transfer_in' | 'transfer_out' | 'purchase' | 'return';

export interface WarehouseActivityItem {
  id: string;
  kind: ActivityKind;
  label: string;
  detail: string;
  status: string;
  amount?: number;
  created_at: string;
}

// Everything tied to a single warehouse by name: the full product list stocked
// there, and every transfer/purchase/return record that references it — a real
// activity feed instead of just aggregate counts.
export async function fetchWarehouseProductsAndActivity(
  warehouseName: string
): Promise<{ products: WarehouseProductRow[]; activity: WarehouseActivityItem[] } | null> {
  const [
    { data: products, error },
    { data: transfersIn },
    { data: transfersOut },
    { data: purchases },
    { data: returns },
  ] = await Promise.all([
    supabase.from('products').select('id, name, sku, category, vendor, stock, low_stock_threshold, price, status').eq('warehouse', warehouseName),
    supabase.from('transfers').select('id, from_warehouse, status, total_items, reason, created_at').eq('to_warehouse', warehouseName),
    supabase.from('transfers').select('id, to_warehouse, status, total_items, reason, created_at').eq('from_warehouse', warehouseName),
    supabase.from('purchases').select('id, vendor, status, total, total_items, created_at').eq('warehouse', warehouseName),
    supabase.from('returns').select('id, customer, status, total_value, reason, created_at').eq('warehouse', warehouseName),
  ]);

  if (error) {
    console.error(error);
    return null;
  }

  const activity: WarehouseActivityItem[] = [
    ...(transfersIn || []).map((t: any) => ({
      id: t.id, kind: 'transfer_in' as const,
      label: `Transfer in from ${t.from_warehouse}`,
      detail: `${t.total_items} item${t.total_items !== 1 ? 's' : ''}${t.reason ? ` · ${t.reason}` : ''}`,
      status: t.status, created_at: t.created_at,
    })),
    ...(transfersOut || []).map((t: any) => ({
      id: t.id, kind: 'transfer_out' as const,
      label: `Transfer out to ${t.to_warehouse}`,
      detail: `${t.total_items} item${t.total_items !== 1 ? 's' : ''}${t.reason ? ` · ${t.reason}` : ''}`,
      status: t.status, created_at: t.created_at,
    })),
    ...(purchases || []).map((p: any) => ({
      id: p.id, kind: 'purchase' as const,
      label: `Purchase order — ${p.vendor}`,
      detail: `${p.total_items} item${p.total_items !== 1 ? 's' : ''}`,
      status: p.status, amount: Number(p.total), created_at: p.created_at,
    })),
    ...(returns || []).map((r: any) => ({
      id: r.id, kind: 'return' as const,
      label: `Return — ${r.customer}`,
      detail: (r.reason as string)?.replace(/_/g, ' ') ?? '',
      status: r.status, amount: Number(r.total_value), created_at: r.created_at,
    })),
  ].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));

  return { products: (products || []) as WarehouseProductRow[], activity };
}
