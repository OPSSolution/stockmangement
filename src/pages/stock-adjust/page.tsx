import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import DashboardLayout from '@/components/feature/DashboardLayout';
import StockAdjustFormModal, { type AdjustLine } from './components/StockAdjustFormModal';
import { Product, ProductStockRow, ProductWarehouseStock, ProductBinStock } from '@/mocks/inventory';
import { StockHistoryEntry } from '@/mocks/stockHistory';
import { supabase } from '@/lib/supabase';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { logAudit } from '@/lib/auditLog';
import { adjustBinQuantity } from '@/lib/stockDeduction';
import { binStockKey } from '@/lib/binStock';
import { nowStamp } from '@/lib/timestamp';
import { asArray } from '@/pages/warehouses/warehouseShared';
import { nearestExpiry } from '@/lib/expiry';

function deriveStatus(stock: number, threshold: number): ProductWarehouseStock['status'] {
  if (stock === 0) return 'out_of_stock';
  if (stock <= threshold) return 'low_stock';
  return 'in_stock';
}

function mapProductMaster(row: Record<string, unknown>): Product {
  return {
    id: row.id as string,
    name: row.name as string,
    sku: row.sku as string,
    category: row.category as string,
    imageUrl: (row.image_url as string) || undefined,
    price: row.price as number,
    productType: (row.product_type as Product['productType']) || 'pack',
    lastUpdated: row.last_updated as string,
  };
}

function mapStockRow(row: Record<string, unknown>): ProductWarehouseStock {
  return {
    id: row.id as string,
    productId: row.product_id as string,
    warehouse: row.warehouse as string,
    stock: row.stock as number,
    onHoldStock: (row.on_hold_stock as number) ?? 0,
    lowStockThreshold: row.low_stock_threshold as number,
    status: row.status as ProductWarehouseStock['status'],
    vendor: (row.vendor as string) || undefined,
    expiryDate: (row.expiry_date as string) || undefined,
    binLocation: (row.bin_location as string) || undefined,
    lastUpdated: row.last_updated as string,
  };
}

function mergeRow(product: Product, stock: ProductWarehouseStock): ProductStockRow {
  return {
    ...product,
    stockRowId: stock.id,
    warehouse: stock.warehouse,
    stock: stock.stock,
    onHoldStock: stock.onHoldStock,
    lowStockThreshold: stock.lowStockThreshold,
    status: stock.status,
    vendor: stock.vendor,
    expiryDate: stock.expiryDate,
    binLocation: stock.binLocation,
    lastUpdated: stock.lastUpdated,
  };
}

interface AdjustBatch {
  reference: string;
  timestamp: string;
  user: string;
  note: string;
  lines: StockHistoryEntry[];
}

function mapHistory(row: Record<string, unknown>): StockHistoryEntry {
  return {
    id: row.id as string,
    productId: row.product_id as string,
    type: row.type as StockHistoryEntry['type'],
    quantity: row.quantity as number,
    stockBefore: row.stock_before as number,
    stockAfter: row.stock_after as number,
    reference: row.reference as string,
    note: (row.note as string) || '',
    warehouse: row.warehouse as string,
    user: row.user_name as string,
    timestamp: row.created_at as string,
    expiryDate: (row.expiry_date as string) || undefined,
    binLocation: (row.bin_location as string) || undefined,
  };
}

export default function StockAdjustPage() {
  const { warehouseScope, profile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [products, setProducts] = useState<ProductStockRow[]>([]);
  const [binStock, setBinStock] = useState<ProductBinStock[]>([]);
  const [warehouseBinsByName, setWarehouseBinsByName] = useState<Record<string, string[]>>({});
  const [history, setHistory] = useState<StockHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);

  // null = closed. A product here pre-seeds the modal's batch (e.g. from a deep link);
  // 'blank' opens it empty, for building a batch entirely from scratch.
  const [createFor, setCreateFor] = useState<ProductStockRow | 'blank' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<AdjustBatch | null>(null);

  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchProducts = async () => {
    setLoading(true);
    let query = supabase
      .from('product_warehouse_stock')
      .select('*, product:products(*)')
      .order('product_id', { ascending: false });
    if (warehouseScope) query = query.in('warehouse', warehouseScope);
    const { data, error } = await query;
    if (error) {
      console.error(error);
      showToast('Failed to load products.', 'error');
    } else {
      setProducts(
        (data || [])
          .filter((row: Record<string, unknown>) => row.product)
          .map((row: Record<string, unknown>) => mergeRow(mapProductMaster(row.product as Record<string, unknown>), mapStockRow(row)))
      );
    }
    setLoading(false);
  };

  const fetchBinStock = async () => {
    const { data, error } = await supabase.from('product_bin_stock').select('*');
    if (error) console.error(error);
    else setBinStock((data || []).map((row) => ({
      id: row.id as string,
      productId: row.product_id as string,
      warehouse: row.warehouse as string,
      binLocation: row.bin_location as string,
      quantity: row.quantity as number,
      expiryDate: (row.expiry_date as string) || undefined,
    })));
  };

  const fetchWarehouses = async () => {
    let query = supabase.from('warehouses').select('name, bin_locations').order('name', { ascending: true });
    if (warehouseScope) query = query.in('name', warehouseScope);
    const { data } = await query;
    if (data) setWarehouseBinsByName(Object.fromEntries(data.map((w) => [w.name as string, asArray<string>(w.bin_locations)])));
  };

  // Only the entries this page itself creates — every line in one Create Adjustment
  // submission shares a single "ADJ-<timestamp>" reference, so they group back into
  // one batch below instead of showing as separate unrelated rows.
  const fetchHistory = async () => {
    setHistoryLoading(true);
    let query = supabase.from('stock_history').select('*').like('reference', 'ADJ-%').order('created_at', { ascending: false }).limit(300);
    if (warehouseScope) query = query.in('warehouse', warehouseScope);
    const { data, error } = await query;
    if (error) console.error(error);
    else setHistory((data || []).map(mapHistory));
    setHistoryLoading(false);
  };

  useEffect(() => {
    fetchProducts();
    fetchBinStock();
    fetchWarehouses();
    fetchHistory();
  }, [warehouseScope]);

  // Deep link from low-stock alerts (Home) — opens the create modal pre-seeded with that product.
  useEffect(() => {
    const restockId = searchParams.get('restock');
    if (restockId && products.length > 0) {
      const target = products.find((p) => p.id === restockId);
      if (target) setCreateFor(target);
      searchParams.delete('restock');
      setSearchParams(searchParams, { replace: true });
    }
  }, [products, searchParams, setSearchParams]);

  const binStockByProduct = useMemo(() => {
    const map: Record<string, ProductBinStock[]> = {};
    binStock.forEach((row) => {
      const key = binStockKey(row.productId, row.warehouse);
      const list = map[key];
      if (list) list.push(row); else map[key] = [row];
    });
    return map;
  }, [binStock]);

  // History rows only carry productId — look the name/SKU/image back up from the
  // products already loaded for the picker.
  const productById = useMemo(() => {
    const map: Record<string, ProductStockRow> = {};
    products.forEach((p) => { if (!map[p.id]) map[p.id] = p; });
    return map;
  }, [products]);

  // Every line from one Create Adjustment submission shares a reference — group them
  // back into one row per batch instead of one row per product line.
  const batches = useMemo<AdjustBatch[]>(() => {
    const map: Record<string, AdjustBatch> = {};
    history.forEach((h) => {
      const existing = map[h.reference];
      if (existing) {
        existing.lines.push(h);
        if (h.timestamp > existing.timestamp) existing.timestamp = h.timestamp;
      } else {
        map[h.reference] = { reference: h.reference, timestamp: h.timestamp, user: h.user, note: h.note, lines: [h] };
      }
    });
    return Object.values(map).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }, [history]);

  const statusCounts = useMemo(() => ({
    all: products.length,
    in_stock: products.filter((p) => p.status === 'in_stock').length,
    low_stock: products.filter((p) => p.status === 'low_stock').length,
    out_of_stock: products.filter((p) => p.status === 'out_of_stock').length,
  }), [products]);

  // Applies one line's adjustment — updates product_warehouse_stock, product_bin_stock,
  // and stock_history, the same tables Inventory reads, so its numbers update too as
  // soon as it's (re)loaded.
  const applyLine = async (line: AdjustLine, note: string, batchId: string): Promise<string | null> => {
    const { product: target, mode, binLocation } = line;
    const quantity = Number(line.quantity) || 0;
    const delta = mode === 'remove' ? -Math.abs(quantity) : Math.abs(quantity);
    const expiryDate = mode === 'add' ? line.expiryDate : undefined;

    const newStock = Math.max(0, target.stock + delta);
    const now = nowStamp();
    const nowIso = new Date().toISOString();

    const currentBinsForRow = binStock.filter((r) => r.productId === target.id && r.warehouse === target.warehouse);
    let projectedBins = currentBinsForRow;
    if (binLocation) {
      const existing = currentBinsForRow.find((r) => r.binLocation === binLocation);
      if (existing) {
        projectedBins = currentBinsForRow.map((r) =>
          r === existing ? { ...r, quantity: Math.max(0, r.quantity + delta), expiryDate: delta > 0 && expiryDate ? expiryDate : r.expiryDate } : r
        );
      } else if (delta > 0) {
        projectedBins = [...currentBinsForRow, { id: `PBS-${target.id}-${Date.now()}`, productId: target.id, warehouse: target.warehouse, binLocation, quantity: delta, expiryDate: expiryDate || undefined }];
      }
    }
    const newExpiryDate = projectedBins.length > 0
      ? nearestExpiry(projectedBins.map((r) => r.expiryDate))
      : (delta > 0 && expiryDate ? expiryDate : target.expiryDate);

    const stockUpdate: Record<string, unknown> = {
      stock: newStock,
      status: deriveStatus(newStock, target.lowStockThreshold),
      last_updated: now,
    };
    if (projectedBins.length > 0) {
      stockUpdate.expiry_date = newExpiryDate || null;
    } else if (delta > 0 && expiryDate) {
      stockUpdate.expiry_date = expiryDate;
    }

    const { error: updateError } = await supabase.from('product_warehouse_stock').update(stockUpdate).eq('id', target.stockRowId);
    if (updateError) {
      console.error(updateError);
      return `Failed to adjust "${target.name}".`;
    }

    const newStatus = deriveStatus(newStock, target.lowStockThreshold);
    const historyId = `SH-${Date.now()}-${Math.round(Math.random() * 1000)}`;
    const { error: historyError } = await supabase.from('stock_history').insert({
      id: historyId,
      product_id: target.id,
      type: 'adjustment',
      quantity: delta,
      stock_before: target.stock,
      stock_after: newStock,
      reference: batchId,
      note: note || 'Manual stock adjustment',
      warehouse: target.warehouse,
      user_name: profile?.full_name || profile?.email || 'Admin',
      created_at: nowIso,
      expiry_date: delta > 0 ? expiryDate || null : null,
      bin_location: binLocation || null,
    });
    if (historyError) console.error(historyError);

    await adjustBinQuantity(target.id, target.warehouse, binLocation, delta, delta > 0 ? expiryDate : undefined);
    if (binLocation) {
      setBinStock((prev) => [...prev.filter((r) => !(r.productId === target.id && r.warehouse === target.warehouse)), ...projectedBins]);
    }

    setProducts((prev) => prev.map((p) => (p.stockRowId === target.stockRowId ? { ...p, stock: newStock, status: newStatus, lastUpdated: now, expiryDate: newExpiryDate } : p)));
    logAudit({
      action: 'update',
      module: 'inventory',
      description: `Adjusted stock for "${target.name}" (${delta > 0 ? '+' : ''}${delta})`,
      referenceId: target.id,
      changes: [{ field: 'Stock', from: target.stock, to: newStock }],
    });

    return newStock <= target.lowStockThreshold ? 'low' : null;
  };

  const handleSubmitBatch = async (lines: AdjustLine[], note: string) => {
    setSubmitting(true);
    const batchId = `ADJ-${Date.now()}`;
    let lowStockHit = false;
    for (const line of lines) {
      const result = await applyLine(line, note, batchId);
      if (result === 'low') lowStockHit = true;
      else if (result) {
        setSubmitting(false);
        showToast(result, 'error');
        return;
      }
    }
    setSubmitting(false);
    setCreateFor(null);
    // Re-sync from the DB so this page's own table reflects exactly what Inventory
    // will also see, instead of trusting the optimistic local patch alone.
    fetchProducts();
    fetchHistory();
    showToast(`Applied ${lines.length} stock adjustment${lines.length === 1 ? '' : 's'}.`);

    if (lowStockHit) {
      try {
        const { data: evalData } = await api.functions.invoke('alert-rules-evaluator', { body: {} });
        if (evalData && evalData.total_created > 0) {
          showToast(`${evalData.total_created} low-stock notification(s) generated.`);
        }
      } catch (evalErr) {
        console.error('Alert evaluator call failed:', evalErr);
      }
    }
  };

  return (
    <DashboardLayout title="Stock Adjust" subtitle="Create a batch adjustment across any warehouse, product, or bin — in one place.">
      {toast && (
        <div className={`fixed top-5 right-5 z-[100] flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium shadow-lg transition-all ${toast.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}>
          <i className={`${toast.type === 'success' ? 'ri-check-line' : 'ri-close-line'} text-base`}></i>
          {toast.msg}
        </div>
      )}

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        {[
          { label: 'Total Stock Rows', value: products.length, icon: 'ri-box-3-line', color: 'text-gray-800', bg: 'bg-gray-100' },
          { label: 'In Stock', value: statusCounts.in_stock, icon: 'ri-checkbox-circle-line', color: 'text-emerald-700', bg: 'bg-emerald-50' },
          { label: 'Low Stock', value: statusCounts.low_stock, icon: 'ri-alert-line', color: 'text-amber-700', bg: 'bg-amber-50' },
          { label: 'Out of Stock', value: statusCounts.out_of_stock, icon: 'ri-close-circle-line', color: 'text-red-600', bg: 'bg-red-50' },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-white rounded-xl px-5 py-4 flex items-center gap-4">
            <div className={`w-10 h-10 flex items-center justify-center rounded-lg ${kpi.bg}`}>
              <i className={`${kpi.icon} ${kpi.color} text-lg`}></i>
            </div>
            <div>
              <p className="text-xl font-bold text-gray-900 tracking-tight">{kpi.value}</p>
              <p className="text-xs text-gray-400">{kpi.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl">
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-gray-100">
          <p className="text-sm font-semibold text-gray-800">Adjustments</p>
          <button
            onClick={() => setCreateFor('blank')}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer whitespace-nowrap"
          >
            <i className="ri-add-line"></i> Create Adjustment
          </button>
        </div>

        {/* One row per Create Adjustment submission — click to see every product in it */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Products</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Note</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">By</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">When</th>
                <th className="py-3 px-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {batches.map((batch) => {
                const firstProduct = productById[batch.lines[0].productId];
                const added = batch.lines.filter((l) => l.quantity > 0).length;
                const removed = batch.lines.filter((l) => l.quantity < 0).length;
                return (
                  <tr key={batch.reference} onClick={() => setSelectedBatch(batch)} className="hover:bg-gray-50/50 transition-colors cursor-pointer">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center shrink-0 overflow-hidden">
                          {firstProduct?.imageUrl ? (
                            <img src={firstProduct.imageUrl} alt={firstProduct.name} className="w-full h-full object-cover" />
                          ) : (
                            <i className="ri-box-3-line text-gray-400 text-sm"></i>
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-gray-800">
                            {firstProduct?.name || batch.lines[0].productId}
                            {batch.lines.length > 1 && <span className="text-gray-400 font-normal"> +{batch.lines.length - 1} more</span>}
                          </p>
                          <p className="text-xs text-gray-400">
                            {batch.lines.length} product{batch.lines.length === 1 ? '' : 's'}
                            {added > 0 && <span className="text-emerald-600"> · {added} added</span>}
                            {removed > 0 && <span className="text-red-500"> · {removed} removed</span>}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-gray-500 text-xs max-w-[220px] truncate">{batch.note || '—'}</td>
                    <td className="py-3 px-4 text-gray-600 text-xs whitespace-nowrap">{batch.user}</td>
                    <td className="py-3 px-4 text-gray-400 text-xs whitespace-nowrap">{batch.timestamp}</td>
                    <td className="py-3 px-4 text-right">
                      <i className="ri-arrow-right-s-line text-gray-300"></i>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {historyLoading ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <i className="ri-loader-4-line animate-spin text-2xl mb-2"></i>
            <p className="text-sm">Loading adjustments…</p>
          </div>
        ) : batches.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <div className="w-12 h-12 flex items-center justify-center mb-3">
              <i className="ri-equalizer-line text-4xl"></i>
            </div>
            <p className="text-sm font-medium">No adjustments yet.</p>
            <button onClick={() => setCreateFor('blank')} className="mt-3 text-xs text-emerald-600 hover:underline cursor-pointer">
              Create your first adjustment
            </button>
          </div>
        )}
      </div>

      {createFor && (
        <StockAdjustFormModal
          products={products}
          binStockByProduct={binStockByProduct}
          warehouseBinsByName={warehouseBinsByName}
          initialProduct={createFor === 'blank' ? null : createFor}
          submitting={submitting}
          onClose={() => setCreateFor(null)}
          onSubmit={handleSubmitBatch}
        />
      )}

      {/* Batch detail — every product line that was part of one Create Adjustment submission */}
      {selectedBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4" onClick={() => setSelectedBatch(null)}>
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 shrink-0">
              <div>
                <h2 className="text-base font-bold text-gray-900">Adjustment Details</h2>
                <p className="text-xs text-gray-400 mt-0.5">{selectedBatch.timestamp} · by {selectedBatch.user}</p>
              </div>
              <button onClick={() => setSelectedBatch(null)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 cursor-pointer">
                <i className="ri-close-line text-lg"></i>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-3">
              {selectedBatch.note && (
                <div className="bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-600">{selectedBatch.note}</div>
              )}
              <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 overflow-hidden">
                {selectedBatch.lines.map((h) => {
                  const product = productById[h.productId];
                  return (
                    <div key={h.id} className="flex items-center gap-2.5 px-3 py-2.5">
                      <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center shrink-0 overflow-hidden">
                        {product?.imageUrl ? (
                          <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
                        ) : (
                          <i className="ri-box-3-line text-gray-400 text-sm"></i>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-800 truncate">{product?.name || h.productId}</p>
                        <p className="text-xs text-gray-400">
                          {h.warehouse}{h.binLocation ? ` · Bin: ${h.binLocation}` : ''} · {h.stockBefore} → {h.stockAfter}
                        </p>
                      </div>
                      <span className={`text-sm font-semibold shrink-0 ${h.quantity > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {h.quantity > 0 ? `+${h.quantity}` : h.quantity}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 shrink-0">
              <button onClick={() => setSelectedBatch(null)} className="w-full py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
