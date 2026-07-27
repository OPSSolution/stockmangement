import { Router } from 'express';
import { generateKeyPairSync } from 'crypto';
import { authenticate, AuthRequest } from '../middleware/auth';
import { supabaseForToken, supabaseAdmin } from '../lib/supabaseEnv';
import { evaluateAlertRules } from '../lib/alertRulesEvaluator';
import { dispatchPendingNotifications } from '../lib/notificationDispatch';

const router = Router();

// UTC [gte, lt) bounds for a period pattern — used for the `deliveries` table,
// whose created_at is a real timestamptz (every other reported table stores
// created_at as a 'YYYY-MM-DD[ HH24:MI]' text prefix, matched with `.like`).
function periodRangeUTC(period: 'daily' | 'monthly' | 'yearly', pattern: string) {
  if (period === 'daily') {
    const start = new Date(`${pattern}T00:00:00.000Z`);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    return { gte: start.toISOString(), lt: end.toISOString() };
  }
  if (period === 'monthly') {
    const [y, m] = pattern.split('-').map(Number);
    return { gte: new Date(Date.UTC(y, m - 1, 1)).toISOString(), lt: new Date(Date.UTC(y, m, 1)).toISOString() };
  }
  const y = Number(pattern);
  return { gte: new Date(Date.UTC(y, 0, 1)).toISOString(), lt: new Date(Date.UTC(y + 1, 0, 1)).toISOString() };
}

function groupCount<T>(rows: T[], field: keyof T): Record<string, number> {
  const m: Record<string, number> = {};
  for (const r of rows) {
    const key = String(r[field]);
    m[key] = (m[key] || 0) + 1;
  }
  return m;
}

// Replaces the Supabase edge function: alert-rules-evaluator
// Reads/writes Supabase (not the local Postgres pool) — alert_rules, products, and
// notifications all live in Supabase since that's what the rest of the app uses.
// Uses the service-role client when available so a rule evaluation triggered by
// any one user's click (or the background scheduler) still checks every admin's
// own category thresholds, not just the caller's.
router.post('/alert-rules-evaluator', async (req: AuthRequest, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const supabase = supabaseAdmin() || supabaseForToken(token);
  if (!supabase) return res.status(503).json({ error: 'Supabase is not configured on the server' });

  try {
    const result = await evaluateAlertRules(supabase);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Real staff-return reasons (the `returns` table was repurposed away from customer
// refunds — see supabase/migrations/20260713000001_returns_staff_workflow.sql —
// so `refund_amount`/`refund_method` are dead columns the app no longer writes;
// `total_value` is the live one) — mirrors src/pages/returns/page.tsx's reasonLabels.
const RETURN_REASON_LABELS: Record<string, string> = {
  photoshoot: 'Used for Photoshoot/Project',
  excess: 'Excess / Not Used',
  damaged: 'Damaged During Use',
  consignment: 'Borrowed (Consignment)',
  other: 'Other',
};

const CATEGORY_COLORS: Record<string, string> = {
  Electronics: '#10b981',
  Furniture: '#f59e0b',
  Accessories: '#6366f1',
  'Smart Home': '#14b8a6',
  Lighting: '#f97316',
};
const FALLBACK_CATEGORY_COLORS = ['#ec4899', '#8b5cf6', '#0ea5e9', '#84cc16', '#f43f5e', '#a855f7'];
function colorForCategory(name: string, idx: number): string {
  return CATEGORY_COLORS[name] || FALLBACK_CATEGORY_COLORS[idx % FALLBACK_CATEGORY_COLORS.length];
}

function daysBetween(a: string | null | undefined, b: string | null | undefined): number | null {
  if (!a || !b) return null;
  const da = new Date(a.replace(' ', 'T'));
  const db = new Date(b.replace(' ', 'T'));
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return null;
  return (db.getTime() - da.getTime()) / 86400000;
}

function inScope(warehouse: string | null | undefined, whList: string[] | null): boolean {
  if (!whList) return true;
  if (!warehouse) return false;
  return whList.includes(warehouse);
}

interface OrderItemRow { productId: string; productName: string; sku: string; quantity: number; unitPrice: number; status?: string; }
interface VendorSplitRow { vendor?: string; warehouse: string; subtotal?: number; items?: OrderItemRow[]; }
interface OrderRow { total: number; status: string; vendor_splits?: VendorSplitRow[]; created_at?: string; }

// Orders have no `warehouse` column — only each vendor split does — so a scoped
// view has to sum matching splits' subtotals/items rather than the order's own
// `total`. Unscoped (admin, no filter) uses the order's own total, matching the
// legacy fast path this replaced.
function scopedOrder(order: OrderRow, whList: string[] | null): { counted: boolean; revenue: number; items: OrderItemRow[] } {
  if (!whList) {
    const items = (order.vendor_splits ?? []).flatMap((s) => s.items ?? []);
    return { counted: true, revenue: Number(order.total || 0), items };
  }
  const matching = (order.vendor_splits ?? []).filter((s) => whList.includes(s.warehouse));
  if (!matching.length) return { counted: false, revenue: 0, items: [] };
  return {
    counted: true,
    revenue: matching.reduce((s, sp) => s + Number(sp.subtotal || 0), 0),
    items: matching.flatMap((sp) => sp.items ?? []),
  };
}

// POST /functions/v1/report-summary
router.post('/report-summary', authenticate, async (req: AuthRequest, res) => {
  const { period, date, month, year, warehouse } = req.body as {
    period: 'daily' | 'monthly' | 'yearly';
    date?: string;
    month?: string;
    year?: string;
    warehouse?: string;
  };

  const token = req.headers.authorization?.replace('Bearer ', '');
  const supabase = supabaseForToken(token);
  if (!supabase) return res.status(503).json({ error: 'Supabase is not configured on the server' });

  try {
    // Resolve the caller's own warehouse scope server-side — never trust the
    // client-sent `warehouse` alone, mirroring src/contexts/AuthContext.tsx's
    // warehouseScope (non-admin with assigned warehouses is restricted to them).
    let allowedWarehouses: string[] | null = null;
    if (req.user) {
      const { data: profile } = await supabase.from('profiles').select('role, warehouses').eq('id', req.user.id).maybeSingle();
      const role = (profile?.role as string) || req.user.role || 'viewer';
      const profileWarehouses = (profile?.warehouses as string[] | null) || [];
      if (role !== 'admin' && profileWarehouses.length > 0) allowedWarehouses = profileWarehouses;
    }
    const requestedWarehouse = warehouse || null;
    let whList: string[] | null;
    if (allowedWarehouses) {
      whList = requestedWarehouse && allowedWarehouses.includes(requestedWarehouse) ? [requestedWarehouse] : allowedWarehouses;
    } else {
      whList = requestedWarehouse ? [requestedWarehouse] : null;
    }

    let currPattern: string;
    let prevPattern: string;
    let trendItems: { label: string; pattern: string }[];

    if (period === 'daily') {
      const d = date || new Date().toISOString().slice(0, 10);
      currPattern = d;
      const prev = new Date(d); prev.setDate(prev.getDate() - 1);
      prevPattern = prev.toISOString().slice(0, 10);
      trendItems = Array.from({ length: 7 }, (_, i) => {
        const day = new Date(d); day.setDate(day.getDate() - (6 - i));
        return {
          label: day.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
          pattern: day.toISOString().slice(0, 10),
        };
      });
    } else if (period === 'monthly') {
      currPattern = month || new Date().toISOString().slice(0, 7);
      const [y, m] = currPattern.split('-').map(Number);
      const prevDate = new Date(y, m - 2, 1);
      prevPattern = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
      const yr = currPattern.slice(0, 4);
      trendItems = Array.from({ length: 12 }, (_, i) => ({
        label: new Date(Number(yr), i, 1).toLocaleDateString('en-US', { month: 'short' }),
        pattern: `${yr}-${String(i + 1).padStart(2, '0')}`,
      }));
    } else {
      currPattern = year || String(new Date().getFullYear());
      prevPattern = String(Number(currPattern) - 1);
      trendItems = Array.from({ length: 5 }, (_, i) => {
        const yr = String(Number(currPattern) - (4 - i));
        return { label: yr, pattern: yr };
      });
    }

    // Fetches every raw row for a period pattern, unfiltered by warehouse — the
    // warehouse scoping happens once, uniformly, in JS afterwards (simpler and
    // safer than building per-table PostgREST filters, especially for tables
    // like `transfers` that have two warehouse columns, not one).
    const getPeriodRaw = async (pat: string) => {
      const delRange = periodRangeUTC(period, pat);
      const [ordRes, delRes, trnRes, purRes, retRes, proRes] = await Promise.all([
        supabase.from('orders').select('total,status,vendor_splits').like('created_at', `${pat}%`),
        supabase.from('deliveries').select('status,warehouse,items,created_at,last_update').gte('created_at', delRange.gte).lt('created_at', delRange.lt),
        supabase.from('transfers').select('status,from_warehouse,to_warehouse').like('created_at', `${pat}%`),
        supabase.from('purchases').select('total,status,warehouse,vendor,total_items,created_at,received_at').like('created_at', `${pat}%`),
        supabase.from('returns').select('total_value,status,warehouse,reason,items,created_at').like('created_at', `${pat}%`),
        supabase.from('promotions').select('status').like('created_at', `${pat}%`),
      ]);
      return {
        orders: (ordRes.data ?? []) as OrderRow[],
        deliveries: (delRes.data ?? []) as { status: string; warehouse: string | null; items: number; created_at: string; last_update: string }[],
        transfers: (trnRes.data ?? []) as { status: string; from_warehouse: string; to_warehouse: string }[],
        purchases: (purRes.data ?? []) as { total: number; status: string; warehouse: string; vendor: string; total_items: number; created_at: string; received_at: string | null }[],
        returns: (retRes.data ?? []) as { total_value: number; status: string; warehouse: string; reason: string; items: { productId: string; quantity: number }[] }[],
        promotions: (proRes.data ?? []) as { status: string }[],
      };
    };

    const summarize = (raw: Awaited<ReturnType<typeof getPeriodRaw>>) => {
      const scopedOrders = raw.orders.map((r) => ({ row: r, scoped: scopedOrder(r, whList) })).filter((x) => x.scoped.counted);
      const delRows = raw.deliveries.filter((r) => inScope(r.warehouse, whList));
      const trnRows = raw.transfers.filter((r) => inScope(r.from_warehouse, whList) || inScope(r.to_warehouse, whList));
      const purRows = raw.purchases.filter((r) => inScope(r.warehouse, whList));
      const retRows = raw.returns.filter((r) => inScope(r.warehouse, whList));
      const proRows = raw.promotions; // store-wide — no warehouse concept to scope by

      return {
        orders:     { count: scopedOrders.length, revenue: scopedOrders.reduce((s, x) => s + x.scoped.revenue, 0), statusBreakdown: groupCount(scopedOrders.map((x) => x.row), 'status') },
        deliveries: { count: delRows.length, statusBreakdown: groupCount(delRows, 'status') },
        transfers:  { count: trnRows.length, statusBreakdown: groupCount(trnRows, 'status') },
        purchases:  { count: purRows.length, total: purRows.reduce((s, r) => s + Number(r.total || 0), 0), statusBreakdown: groupCount(purRows, 'status') },
        // "value" — the internal worth of stock returned, not a customer refund
        // (refund_amount is dead; see RETURN_REASON_LABELS comment above).
        returns:    { count: retRows.length, value: retRows.reduce((s, r) => s + Number(r.total_value || 0), 0), statusBreakdown: groupCount(retRows, 'status') },
        promotions: { count: proRows.length, statusBreakdown: groupCount(proRows, 'status') },
      };
    };

    const [currentRaw, previousRaw] = await Promise.all([getPeriodRaw(currPattern), getPeriodRaw(prevPattern)]);
    const current = summarize(currentRaw);
    const previous = summarize(previousRaw);

    const trend = await Promise.all(trendItems.map(async ({ label, pattern }) => {
      const { data } = await supabase.from('orders').select('total,status,vendor_splits').like('created_at', `${pattern}%`);
      const rows = ((data ?? []) as OrderRow[]).map((r) => scopedOrder(r, whList)).filter((x) => x.counted);
      return { label, orders: rows.length, revenue: rows.reduce((s, r) => s + r.revenue, 0) };
    }));

    // ── Detailed analytics — real aggregates for the current period, replacing
    // what used to be static seed-table reads (daily_revenue, top_products, etc).
    const [productsRes, warehousesRes] = await Promise.all([
      supabase.from('products').select('id,category,stock,on_hold_stock'),
      supabase.from('warehouses').select('name').order('name', { ascending: true }),
    ]);
    const productCategory = new Map<string, string>();
    const productStock = new Map<string, { stock: number; onHold: number }>();
    for (const p of productsRes.data ?? []) {
      productCategory.set(p.id, p.category || 'Uncategorized');
      productStock.set(p.id, { stock: Number(p.stock || 0), onHold: Number(p.on_hold_stock || 0) });
    }
    const allWarehouseNames = (warehousesRes.data ?? []).map((w) => w.name as string);
    const scopedWarehouseNames = whList ? allWarehouseNames.filter((w) => whList!.includes(w)) : allWarehouseNames;

    // Revenue series — always "this calendar month, daily" and "this calendar
    // year, monthly", independent of the period navigator above.
    const now = new Date();
    const thisMonthPrefix = now.toISOString().slice(0, 7);
    const daysSoFar = now.getUTCDate();
    const dailySeriesItems = Array.from({ length: daysSoFar }, (_, i) => {
      const n = i + 1;
      return { pattern: `${thisMonthPrefix}-${String(n).padStart(2, '0')}`, date: `${now.toLocaleDateString('en-US', { month: 'short' })} ${n}`, label: String(n) };
    });
    const thisYear = String(now.getUTCFullYear());
    const monthsSoFar = now.getUTCMonth() + 1;
    const monthlySeriesItems = Array.from({ length: monthsSoFar }, (_, i) => ({
      pattern: `${thisYear}-${String(i + 1).padStart(2, '0')}`,
      date: new Date(Number(thisYear), i, 1).toLocaleDateString('en-US', { month: 'short' }),
      label: new Date(Number(thisYear), i, 1).toLocaleDateString('en-US', { month: 'short' }),
    }));

    const revenueSeriesPoint = async (pattern: string, dateLabel: string, label: string) => {
      const [{ data: ordData }, { data: retData }] = await Promise.all([
        supabase.from('orders').select('total,status,vendor_splits').like('created_at', `${pattern}%`),
        supabase.from('returns').select('warehouse').like('created_at', `${pattern}%`),
      ]);
      const orders = ((ordData ?? []) as OrderRow[]).map((r) => scopedOrder(r, whList)).filter((x) => x.counted);
      const returnsCount = ((retData ?? []) as { warehouse: string }[]).filter((r) => inScope(r.warehouse, whList)).length;
      return { date: dateLabel, label, revenue: orders.reduce((s, o) => s + o.revenue, 0), orders: orders.length, returns: returnsCount };
    };

    const [revenueDaily, revenueMonthly] = await Promise.all([
      Promise.all(dailySeriesItems.map((it) => revenueSeriesPoint(it.pattern, it.date, it.label))),
      Promise.all(monthlySeriesItems.map((it) => revenueSeriesPoint(it.pattern, it.date, it.label))),
    ]);

    // Top products — flatten current & previous period order items (already
    // fetched above) so revenue trend arrows compare like-for-like.
    //
    // Note on "return rate" below: returns are tied to stock_requests, not to
    // orders (see RETURN_REASON_LABELS comment) — there is no valid way to
    // relate "units returned this period" to "units sold via Orders this
    // period" (they can be entirely different stock, from different times).
    // Comparing them produced nonsense figures (e.g. 4900%) when returns
    // outnumbered this-period sales. Instead we use each product's *current*
    // on_hold_stock / stock — a live, always-coherent quality signal — not a
    // period-scoped sales ratio.
    const currentItems = currentRaw.orders.flatMap((r) => scopedOrder(r, whList).items);
    const previousItems = previousRaw.orders.flatMap((r) => scopedOrder(r, whList).items);

    type ProductAgg = { productId: string; productName: string; sku: string; unitsSold: number; revenue: number };
    const aggregateProducts = (items: OrderItemRow[]): Map<string, ProductAgg> => {
      const map = new Map<string, ProductAgg>();
      for (const it of items) {
        if (!it.productId) continue;
        const existing = map.get(it.productId) || { productId: it.productId, productName: it.productName, sku: it.sku, unitsSold: 0, revenue: 0 };
        existing.unitsSold += Number(it.quantity || 0);
        existing.revenue += Number(it.quantity || 0) * Number(it.unitPrice || 0);
        map.set(it.productId, existing);
      }
      return map;
    };
    const currentProductAgg = aggregateProducts(currentItems);
    const previousProductAgg = aggregateProducts(previousItems);

    const onHoldRate = (productId: string): number => {
      const s = productStock.get(productId);
      if (!s || s.stock <= 0) return 0;
      return Number(((s.onHold / s.stock) * 100).toFixed(1));
    };

    const topProducts = [...currentProductAgg.values()]
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10)
      .map((p) => {
        const prevRevenue = previousProductAgg.get(p.productId)?.revenue ?? 0;
        const trendDir: 'up' | 'down' | 'stable' =
          prevRevenue === 0 ? 'stable' : p.revenue > prevRevenue * 1.05 ? 'up' : p.revenue < prevRevenue * 0.95 ? 'down' : 'stable';
        return {
          productId: p.productId,
          productName: p.productName,
          sku: p.sku,
          category: productCategory.get(p.productId) || 'Uncategorized',
          unitsSold: p.unitsSold,
          revenue: p.revenue,
          onHoldRate: onHoldRate(p.productId),
          trend: trendDir,
        };
      });

    // Category breakdown — revenue for the current period; on-hold rate is a
    // live snapshot across every product in the category (see note above),
    // not scoped to this period's sales.
    const categoryRevenue = new Map<string, { revenue: number; unitsSold: number }>();
    for (const [productId, agg] of currentProductAgg) {
      const cat = productCategory.get(productId) || 'Uncategorized';
      const existing = categoryRevenue.get(cat) || { revenue: 0, unitsSold: 0 };
      existing.revenue += agg.revenue;
      existing.unitsSold += agg.unitsSold;
      categoryRevenue.set(cat, existing);
    }
    const categoryStock = new Map<string, { stock: number; onHold: number }>();
    for (const [productId, cat] of productCategory) {
      const s = productStock.get(productId);
      if (!s) continue;
      const existing = categoryStock.get(cat) || { stock: 0, onHold: 0 };
      existing.stock += s.stock;
      existing.onHold += s.onHold;
      categoryStock.set(cat, existing);
    }
    const categoryBreakdown = [...categoryRevenue.entries()]
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .map(([category, agg], idx) => {
        const stockAgg = categoryStock.get(category);
        return {
          category,
          revenue: agg.revenue,
          unitsSold: agg.unitsSold,
          onHoldUnits: stockAgg?.onHold ?? 0,
          onHoldRate: stockAgg && stockAgg.stock > 0 ? Number(((stockAgg.onHold / stockAgg.stock) * 100).toFixed(1)) : 0,
          color: colorForCategory(category, idx),
        };
      });

    // Return reasons — current period, warehouse-scoped.
    const scopedReturns = currentRaw.returns.filter((r) => inScope(r.warehouse, whList));
    const reasonAgg = new Map<string, { count: number; value: number }>();
    for (const r of scopedReturns) {
      const existing = reasonAgg.get(r.reason) || { count: 0, value: 0 };
      existing.count += 1;
      existing.value += Number(r.total_value || 0);
      reasonAgg.set(r.reason, existing);
    }
    const totalReturnCount = scopedReturns.length;
    const returnReasons = [...reasonAgg.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .map(([reason, agg]) => ({
        reason: RETURN_REASON_LABELS[reason] || reason,
        count: agg.count,
        value: agg.value,
        percentage: totalReturnCount > 0 ? Number(((agg.count / totalReturnCount) * 100).toFixed(1)) : 0,
      }));

    // Warehouse performance — every warehouse in scope, even ones with zero
    // activity this period, so the panel doesn't silently drop a warehouse.
    const warehousePerformance = scopedWarehouseNames.map((wname) => {
      const whPurchases = currentRaw.purchases.filter((p) => p.warehouse === wname && p.status === 'received');
      const whDeliveries = currentRaw.deliveries.filter((d) => d.warehouse === wname && (d.status === 'in_transit' || d.status === 'delivered'));
      const whDeliveriesAll = currentRaw.deliveries.filter((d) => d.warehouse === wname);
      const whReturns = currentRaw.returns.filter((r) => r.warehouse === wname);
      const delivered = whDeliveriesAll.filter((d) => d.status === 'delivered');
      const processingDays = delivered.map((d) => daysBetween(d.created_at, d.last_update)).filter((n): n is number => n !== null);
      return {
        warehouse: wname,
        inbound: whPurchases.reduce((s, p) => s + Number(p.total_items || 0), 0),
        outbound: whDeliveries.reduce((s, d) => s + Number(d.items || 0), 0),
        returns: whReturns.length,
        fulfillmentRate: whDeliveriesAll.length > 0 ? Number(((delivered.length / whDeliveriesAll.length) * 100).toFixed(1)) : 0,
        avgProcessingDays: processingDays.length > 0 ? Number((processingDays.reduce((s, n) => s + n, 0) / processingDays.length).toFixed(1)) : 0,
      };
    });

    // Vendor performance — grouped by the vendor name stored on each purchase.
    const vendorNames = [...new Set(currentRaw.purchases.filter((p) => inScope(p.warehouse, whList)).map((p) => p.vendor))];
    const vendorPerformance = vendorNames.map((vname) => {
      const vPurchases = currentRaw.purchases.filter((p) => p.vendor === vname && inScope(p.warehouse, whList));
      const received = vPurchases.filter((p) => p.status === 'received');
      const rejected = vPurchases.filter((p) => p.status === 'cancelled');
      const deliveryDays = received.map((p) => daysBetween(p.created_at, p.received_at)).filter((n): n is number => n !== null);
      return {
        vendor: vname,
        totalOrders: vPurchases.length,
        fulfillmentRate: vPurchases.length > 0 ? Number(((received.length / vPurchases.length) * 100).toFixed(1)) : 0,
        rejectedOrders: rejected.length,
        avgDeliveryDays: deliveryDays.length > 0 ? Number((deliveryDays.reduce((s, n) => s + n, 0) / deliveryDays.length).toFixed(1)) : 0,
        revenue: received.reduce((s, p) => s + Number(p.total || 0), 0),
      };
    }).sort((a, b) => b.fulfillmentRate - a.fulfillmentRate).slice(0, 10);

    res.json({
      period, current, previous, trend,
      revenueDaily, revenueMonthly, topProducts, categoryBreakdown, returnReasons,
      warehousePerformance, vendorPerformance,
      warehouseOptions: allWarehouseNames,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /functions/v1/notify-admins  (public — the customer-facing order form
// has no logged-in user, so it can't read `profiles` under RLS to find who
// the admins are. Service-role bypasses that; this route only ever creates
// notifications, never reads/writes anything else, so it's safe unauthenticated.)
router.post('/notify-admins', async (req, res) => {
  const { type, title, message, data } = req.body as {
    type: string; title: string; message: string; data?: Record<string, unknown>;
  };
  if (!type || !title || !message) {
    return res.status(400).json({ success: false, error: 'type, title, and message are required' });
  }

  const admin = supabaseAdmin();
  if (!admin) return res.status(503).json({ success: false, error: 'Service role is not configured on the server' });

  try {
    const { data: admins, error: adminsErr } = await admin.from('profiles').select('id').eq('role', 'admin');
    if (adminsErr) throw adminsErr;
    if (!admins || admins.length === 0) return res.json({ success: true, notified: 0 });

    const rows = admins.map((a) => ({
      user_id: a.id,
      type,
      title,
      message,
      data: data ?? {},
      is_read: false,
      is_emailed: false,
      is_webhook_sent: false,
    }));
    const { error: insertErr } = await admin.from('notifications').insert(rows);
    if (insertErr) throw insertErr;
    res.json({ success: true, notified: admins.length });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /functions/v1/get-vapid-public-key
router.post('/get-vapid-public-key', (_req, res) => {
  const publicKey = process.env.VAPID_PUBLIC_KEY || '';
  if (!publicKey) {
    return res.status(404).json({ error: 'VAPID_PUBLIC_KEY not configured in environment' });
  }
  res.json({ publicKey });
});

// POST /functions/v1/notification-channel-status
// Reports whether each dispatch channel actually has credentials configured
// server-side — never returns the secrets themselves — so the settings page
// can show real status instead of implying every toggle works.
router.post('/notification-channel-status', (_req, res) => {
  res.json({
    emailConfigured: !!process.env.RESEND_API_KEY,
    pushConfigured: !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY),
  });
});

// POST /functions/v1/generate-vapid-keys  (admin only)
router.post('/generate-vapid-keys', authenticate, (_req: AuthRequest, res) => {
  try {
    const { publicKey: pub, privateKey: priv } = generateKeyPairSync('ec', {
      namedCurve: 'P-256',
    });

    const pubJwk = pub.export({ format: 'jwk' }) as Record<string, string>;
    const privJwk = priv.export({ format: 'jwk' }) as Record<string, string>;

    // Build 65-byte uncompressed point: 0x04 || x (32 bytes) || y (32 bytes)
    const x = Buffer.from(pubJwk.x, 'base64url');
    const y = Buffer.from(pubJwk.y, 'base64url');
    const uncompressed = Buffer.concat([Buffer.from([0x04]), x, y]);

    res.json({
      publicKey: uncompressed.toString('base64url'),
      privateKey: privJwk.d,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /functions/v1/webhook-dispatch  (admin only)
router.post('/webhook-dispatch', authenticate, async (req: AuthRequest, res) => {
  const { notification, config_ids } = req.body as {
    notification: { id: string; type: string; title: string; message: string };
    config_ids: string[];
  };

  if (!notification || !config_ids?.length) {
    return res.status(400).json({ dispatched: false, error: 'Missing notification or config_ids' });
  }

  const token = req.headers.authorization?.replace('Bearer ', '');
  const supabase = supabaseForToken(token);
  if (!supabase) return res.status(503).json({ dispatched: false, error: 'Supabase is not configured on the server' });

  try {
    const { data: configs } = await supabase
      .from('webhook_configs')
      .select('*')
      .in('id', config_ids)
      .eq('is_active', true);

    const results: Array<{ id: string; name: string; success: boolean; status?: number; error?: string }> = [];

    for (const config of configs ?? []) {
      try {
        let body: Record<string, unknown>;

        if (config.provider === 'slack') {
          body = { text: `*${notification.title}*\n${notification.message}` };
        } else if (config.provider === 'discord') {
          body = { content: `**${notification.title}**\n${notification.message}` };
        } else if (config.provider === 'telegram') {
          // webhook_url = https://api.telegram.org/bot{TOKEN}/sendMessage, secret_token = chat_id
          body = {
            chat_id: config.secret_token || '',
            text: `*${notification.title}*\n${notification.message}`,
            parse_mode: 'Markdown',
          };
        } else {
          body = { notification };
        }

        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (config.secret_token && config.provider !== 'telegram' && config.provider !== 'discord') {
          headers['Authorization'] = `Bearer ${config.secret_token}`;
        }

        const response = await fetch(config.webhook_url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        });

        results.push({ id: config.id, name: config.name, success: response.ok, status: response.status });
      } catch (err: any) {
        results.push({ id: config.id, name: config.name, success: false, error: err.message });
      }
    }

    const dispatched = results.length > 0 && results.some((r) => r.success);
    res.json({ dispatched, results });
  } catch (err: any) {
    res.status(500).json({ dispatched: false, error: err.message });
  }
});

// POST /functions/v1/scheduled-dispatch  (authenticated)
// Actually sends pending notifications out — email via Resend (if
// RESEND_API_KEY is set), webhooks to any matching active integration, and
// browser push (if VAPID keys are set) — instead of just marking rows sent.
router.post('/scheduled-dispatch', authenticate, async (req: AuthRequest, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const supabase = supabaseAdmin() || supabaseForToken(token);
  if (!supabase) return res.status(503).json({ message: 'Supabase is not configured on the server' });

  try {
    const { emailed, webhooked, pushed } = await dispatchPendingNotifications(supabase);
    const parts = [`${emailed} email${emailed !== 1 ? 's' : ''}`, `${webhooked} webhook${webhooked !== 1 ? 's' : ''}`, `${pushed} push${pushed !== 1 ? 'es' : ''}`];
    res.json({ message: `Dispatched: ${parts.join(', ')}`, emailed, webhooked, pushed });
  } catch (err: any) {
    res.status(500).json({ message: 'Dispatch failed: ' + err.message });
  }
});

// POST /functions/v1/invite-user  (admin only)
// Creates the user directly in Supabase Auth + the Supabase `profiles` table —
// that's the only database the real app (login, Teams, everything) reads from.
// Requires SUPABASE_SERVICE_ROLE_KEY to be set on the server; that key must
// never be exposed to the browser.
router.post('/invite-user', authenticate, async (req: AuthRequest, res) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }

  const { email, full_name = 'User', role = 'staff', phone, password } = req.body;

  if (!email) return res.status(400).json({ success: false, error: 'Email is required' });
  if (!['admin', 'staff', 'viewer'].includes(role)) {
    return res.status(400).json({ success: false, error: 'Invalid role' });
  }

  const admin = supabaseAdmin();
  if (!admin) {
    return res.status(500).json({
      success: false,
      error: 'SUPABASE_SERVICE_ROLE_KEY is not configured on the server — invite cannot create a real Supabase account without it.',
    });
  }

  const plainPassword = password || Math.random().toString(36).slice(-10);

  try {
    console.log(`[invite-user] creating auth user for ${email}`);
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: plainPassword,
      email_confirm: true,
      user_metadata: { full_name, role, phone: phone || null },
    });

    if (createErr || !created?.user) {
      console.log(`[invite-user] createUser failed:`, createErr?.message);
      return res.status(400).json({ success: false, error: createErr?.message || 'Failed to create user' });
    }

    const userId = created.user.id;
    console.log(`[invite-user] auth user created, id=${userId}`);

    // A DB trigger (on_auth_user_created) creates a bare-bones profiles row in
    // the same transaction as the auth user, so it already exists by now —
    // upsert to fill in the full details rather than insert (which would
    // conflict with the trigger's row).
    const { error: profileErr } = await admin
      .from('profiles')
      .upsert({ id: userId, email, full_name, role, phone: phone || null }, { onConflict: 'id' });

    if (profileErr) {
      console.log(`[invite-user] profile upsert failed, rolling back auth user ${userId}:`, profileErr.message);
      await admin.auth.admin.deleteUser(userId).catch((e) => console.log('[invite-user] rollback delete failed:', e));
      return res.status(500).json({ success: false, error: profileErr.message });
    }
    console.log(`[invite-user] profile upsert OK`);

    await admin.from('notification_settings').insert({
      user_id: userId,
      email_enabled: true,
      sms_enabled: false,
      in_app_enabled: true,
      browser_push_enabled: true,
      category_thresholds: { Electronics: 5, Furniture: 3, Lighting: 4, 'Smart Home': 5, Accessories: 10 },
    });

    res.json({ success: true, userId, email, role, tempPassword: password ? undefined : plainPassword });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
