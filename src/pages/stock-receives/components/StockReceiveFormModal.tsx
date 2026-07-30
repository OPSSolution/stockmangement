import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { asArray } from '@/pages/warehouses/warehouseShared';
import { groupBinStock, lowestQuantityBin, binExpiry, binStockKey, buildReceiveBinOptions, type BinStockRow } from '@/lib/binStock';
import { expiryTone, formatExpiry } from '@/lib/expiry';
import BinCombobox from '@/components/feature/BinCombobox';
import type { StockReceiveItem } from '@/mocks/stockReceives';

interface FormData {
  warehouse: string;
  vendor: string;
  reference: string;
  notes: string;
  items: StockReceiveItem[];
}

interface Props {
  onClose: () => void;
  onSubmit: (data: FormData) => void;
}

interface ProductOption {
  id: string;
  name: string;
  sku: string;
  image_url?: string | null;
  stock: number;
  warehouse: string;
}

export default function StockReceiveFormModal({ onClose, onSubmit }: Props) {
  const { warehouseScope } = useAuth();
  const [form, setForm] = useState<Omit<FormData, 'items'>>({ warehouse: '', vendor: '', reference: '', notes: '' });
  const [items, setItems] = useState<StockReceiveItem[]>([]);
  const [selectedProduct, setSelectedProduct] = useState('');
  const [selectedQty, setSelectedQty] = useState(1);
  const [selectedBin, setSelectedBin] = useState('');
  const [selectedExpiry, setSelectedExpiry] = useState('');
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [warehouses, setWarehouses] = useState<string[]>([]);
  const [warehouseVendors, setWarehouseVendors] = useState<Record<string, string[]>>({});
  const [warehouseBinLocations, setWarehouseBinLocations] = useState<Record<string, string[]>>({});
  const [binStockByProduct, setBinStockByProduct] = useState<Record<string, BinStockRow[]>>({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      let whQuery = supabase.from('warehouses').select('name, vendor_names, bin_locations').order('name', { ascending: true });
      if (warehouseScope) whQuery = whQuery.in('name', warehouseScope);
      const [{ data: wh }, { data: prod }, { data: bins }] = await Promise.all([
        whQuery,
        supabase.from('product_warehouse_stock').select('stock, warehouse, product:products(id, name, sku, image_url)'),
        supabase.from('product_bin_stock').select('product_id, warehouse, bin_location, quantity, expiry_date'),
      ]);
      if (wh) {
        setWarehouses(wh.map((w) => w.name as string));
        setWarehouseVendors(Object.fromEntries(wh.map((w) => [w.name as string, asArray<string>(w.vendor_names)])));
        setWarehouseBinLocations(Object.fromEntries(wh.map((w) => [w.name as string, asArray<string>(w.bin_locations)])));
        setForm((prev) => (prev.warehouse ? prev : { ...prev, warehouse: warehouseScope?.[0] || wh[0]?.name || '' }));
      }
      if (prod) {
        setProducts(
          (prod as Record<string, unknown>[])
            .filter((row) => row.product)
            .map((row) => {
              const p = row.product as Record<string, unknown>;
              return { id: p.id as string, name: p.name as string, sku: p.sku as string, image_url: p.image_url as string | null, stock: row.stock as number, warehouse: row.warehouse as string };
            })
        );
      }
      setBinStockByProduct(groupBinStock((bins || []) as { product_id: string; warehouse: string; bin_location: string; quantity: number; expiry_date?: string | null }[]));
      setLoading(false);
    })();
  }, [warehouseScope]);

  const vendorOptions = warehouseVendors[form.warehouse] || [];
  const binOptionsForWarehouse = warehouseBinLocations[form.warehouse] || [];
  const productOptions = products.filter((p) => p.warehouse === form.warehouse && !items.some((i) => i.productId === p.id));
  const selectedBinOptions = buildReceiveBinOptions(binStockByProduct[binStockKey(selectedProduct, form.warehouse)], binOptionsForWarehouse);

  const handleWarehouseChange = (warehouse: string) => {
    setForm((f) => ({ ...f, warehouse, vendor: '' }));
    setItems([]);
    setSelectedProduct('');
  };

  const handleProductSelect = (id: string) => {
    setSelectedProduct(id);
    const defaultBin = lowestQuantityBin(binStockByProduct[binStockKey(id, form.warehouse)]);
    setSelectedBin(defaultBin);
    setSelectedExpiry(binExpiry(binStockByProduct[binStockKey(id, form.warehouse)], defaultBin) || '');
  };

  const handleBinSelect = (bin: string) => {
    setSelectedBin(bin);
    setSelectedExpiry(binExpiry(binStockByProduct[binStockKey(selectedProduct, form.warehouse)], bin) || '');
  };

  const addItem = () => {
    const product = products.find((p) => p.id === selectedProduct && p.warehouse === form.warehouse);
    if (!product || selectedQty < 1) return;
    setItems((prev) => [
      ...prev,
      {
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        imageUrl: product.image_url || null,
        quantity: selectedQty,
        binLocation: selectedBin.trim() || undefined,
        expiryDate: selectedExpiry || undefined,
      },
    ]);
    setSelectedProduct('');
    setSelectedQty(1);
    setSelectedBin('');
    setSelectedExpiry('');
  };

  const removeItem = (productId: string) => {
    setItems((prev) => prev.filter((i) => i.productId !== productId));
  };

  const totalUnits = items.reduce((sum, i) => sum + i.quantity, 0);

  const handleSubmit = () => {
    if (!form.warehouse) { setError('Select which warehouse this stock is landing in.'); return; }
    if (items.length === 0) { setError('Add at least one product.'); return; }
    setError('');
    onSubmit({ ...form, items });
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-2xl h-[90vh] overflow-y-auto shadow-lg" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">New Stock Receive</h2>
            <p className="text-sm text-gray-500 mt-0.5">Log stock that's arrived — applies to inventory immediately, no approval step</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 cursor-pointer">
            <i className="ri-close-line text-gray-500"></i>
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Warehouse + Vendor */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1.5">Warehouse *</label>
              {warehouseScope && warehouseScope.length === 1 ? (
                <input value={warehouseScope[0]} disabled className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-gray-50 text-gray-500" />
              ) : (
                <select
                  value={form.warehouse}
                  onChange={(e) => handleWarehouseChange(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 text-gray-800 cursor-pointer"
                >
                  <option value="">Select warehouse…</option>
                  {(warehouseScope || warehouses).map((w) => <option key={w} value={w}>{w}</option>)}
                </select>
              )}
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1.5">Vendor / Supplier (optional)</label>
              <select
                value={form.vendor}
                onChange={(e) => setForm((f) => ({ ...f, vendor: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 cursor-pointer"
              >
                <option value="">None / other</option>
                {vendorOptions.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1.5">Reference (optional)</label>
              <input
                type="text"
                value={form.reference}
                onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
                placeholder="Supplier invoice / DO number"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 placeholder-gray-400"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1.5">Notes (optional)</label>
              <input
                type="text"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Any remarks about this receive…"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 placeholder-gray-400"
              />
            </div>
          </div>

          {/* Items */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-2">Products Received *</label>
            {loading ? (
              <div className="text-xs text-gray-400 py-2">Loading…</div>
            ) : !form.warehouse ? (
              <div className="text-xs text-gray-400 py-2">Select a warehouse first.</div>
            ) : (
              <div className="border border-gray-200 rounded-lg p-3 space-y-2 bg-gray-50/50">
                <div className="flex gap-2 flex-wrap">
                  <select
                    value={selectedProduct}
                    onChange={(e) => handleProductSelect(e.target.value)}
                    className="flex-1 min-w-40 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 cursor-pointer bg-white"
                  >
                    <option value="">Select product…</option>
                    {productOptions.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} ({p.sku}) — {p.stock} on hand</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={1}
                    value={selectedQty === 0 ? '' : selectedQty}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSelectedQty(val === '' ? 0 : Math.max(0, Number(val) || 0));
                    }}
                    placeholder="Qty"
                    className="w-20 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
                  />
                  <button
                    type="button"
                    onClick={addItem}
                    disabled={!selectedProduct || selectedQty < 1}
                    className="px-4 py-2.5 bg-emerald-500 text-white text-sm font-medium rounded-lg hover:bg-emerald-600 disabled:opacity-40 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <i className="ri-add-line mr-1"></i>Add
                  </button>
                </div>
                {selectedProduct && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Bin location</label>
                      <BinCombobox options={selectedBinOptions} value={selectedBin} onChange={handleBinSelect} placeholder="Search or type a bin…" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Expiry date (optional)</label>
                      <input
                        type="date"
                        value={selectedExpiry}
                        onChange={(e) => setSelectedExpiry(e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {items.length > 0 ? (
              <div className="mt-3 border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Product</th>
                      <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Qty</th>
                      <th className="px-3 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {items.map((item) => (
                      <tr key={item.productId}>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0 overflow-hidden">
                              {item.imageUrl ? (
                                <img src={item.imageUrl} alt={item.productName} className="w-full h-full object-cover" />
                              ) : (
                                <i className="ri-box-3-line text-emerald-500 text-xs"></i>
                              )}
                            </div>
                            <div>
                              <p className="font-medium text-gray-800 text-sm">{item.productName}</p>
                              <p className="text-xs text-gray-400 font-mono">
                                {item.sku}
                                {item.binLocation ? ` · Bin: ${item.binLocation}` : ''}
                              </p>
                              {item.expiryDate && (
                                <p className={`text-[11px] ${expiryTone(item.expiryDate)}`}>Exp {formatExpiry(item.expiryDate)}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-center text-gray-700">{item.quantity}</td>
                        <td className="px-3 py-2.5 text-right">
                          <button onClick={() => removeItem(item.productId)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-50 text-gray-400 hover:text-red-500 cursor-pointer">
                            <i className="ri-delete-bin-line text-sm"></i>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t border-gray-200">
                    <tr>
                      <td className="px-4 py-2 text-sm text-right text-gray-500">Total Units</td>
                      <td className="px-3 py-2 text-center text-sm font-semibold text-gray-800">{totalUnits}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <div className="mt-3 border border-dashed border-gray-200 rounded-lg py-6 text-center text-sm text-gray-400">
                No products added yet
              </div>
            )}
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer whitespace-nowrap">
            Cancel
          </button>
          <button onClick={handleSubmit} className="px-5 py-2 bg-emerald-500 text-white text-sm font-semibold rounded-lg hover:bg-emerald-600 cursor-pointer whitespace-nowrap">
            <i className="ri-inbox-archive-line mr-1.5"></i>Receive Stock
          </button>
        </div>
      </div>
    </div>
  );
}
