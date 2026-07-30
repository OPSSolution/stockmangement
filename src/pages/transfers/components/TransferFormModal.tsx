import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { getReservedQuantities, availableStock } from '@/lib/stockReservations';
import { expiryTone, formatExpiry } from '@/lib/expiry';
import { groupBinStock, lowestQuantityBin, binExpiry, binStockKey, type BinStockRow } from '@/lib/binStock';

interface NewTransferItem {
  productId: string;
  productName: string;
  sku: string;
  imageUrl?: string | null;
  quantity: number;
  unitPrice: number;
  fromBinLocation?: string;
}

interface FormData {
  id: string;
  fromWarehouse: string;
  toWarehouse: string;
  reason: string;
  notes: string;
  expectedArrival: string;
  items: NewTransferItem[];
}

interface TransferFormModalProps {
  onClose: () => void;
  onSubmit: (data: FormData) => void;
}

const emptyForm = (fromWarehouse = ''): FormData => ({
  id: '',
  fromWarehouse,
  toWarehouse: '',
  reason: '',
  notes: '',
  expectedArrival: '',
  items: [],
});

interface ProductOption {
  id: string;
  name: string;
  sku: string;
  image_url?: string | null;
  stock: number;
  warehouse: string;
  bin_location?: string | null;
  expiry_date?: string | null;
}

export default function TransferFormModal({ onClose, onSubmit }: TransferFormModalProps) {
  const { warehouseScope } = useAuth();
  const [form, setForm] = useState<FormData>(emptyForm(warehouseScope?.[0] || ''));
  const [selectedProduct, setSelectedProduct] = useState('');
  const [selectedQty, setSelectedQty] = useState(1);
  const [selectedBin, setSelectedBin] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [binStockByProduct, setBinStockByProduct] = useState<Record<string, BinStockRow[]>>({});
  const [warehouses, setWarehouses] = useState<string[]>([]);
  const [reserved, setReserved] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const autoTransferId = useMemo(
    () => `TRF-${String(Math.floor(Date.now() / 1000) % 100000).padStart(5, '0')}`,
    []
  );

  useEffect(() => {
    const fetchProducts = async () => {
      setLoading(true);
      const [{ data, error }, { data: binRows }] = await Promise.all([
        supabase.from('product_warehouse_stock').select('stock, warehouse, bin_location, expiry_date, product:products(id, name, sku, image_url)'),
        supabase.from('product_bin_stock').select('product_id, warehouse, bin_location, quantity, expiry_date'),
      ]);
      if (error) console.error(error);
      else setProducts(
        (data || [])
          .filter((row: Record<string, unknown>) => row.product)
          .map((row: Record<string, unknown>) => {
            const p = row.product as Record<string, unknown>;
            return { id: p.id as string, name: p.name as string, sku: p.sku as string, image_url: p.image_url as string | null, stock: row.stock as number, warehouse: row.warehouse as string, bin_location: row.bin_location as string | null, expiry_date: row.expiry_date as string | null };
          })
      );
      setBinStockByProduct(groupBinStock((binRows || []) as { product_id: string; warehouse: string; bin_location: string; quantity: number; expiry_date?: string | null }[]));
      setLoading(false);
    };

    const fetchWarehouses = async () => {
      const { data, error } = await supabase.from('warehouses').select('name').order('name', { ascending: true });
      if (!error && data) setWarehouses(data.map((w) => w.name as string));
    };

    fetchProducts();
    fetchWarehouses();
    getReservedQuantities().then(setReserved);
  }, []);

  useEffect(() => {
    if (!form.id) {
      setForm((prev) => ({ ...prev, id: autoTransferId }));
    }
  }, [form.id, autoTransferId]);

  // Default "From Warehouse" to the first available warehouse once loaded,
  // for admins/unscoped users only — scoped staff are locked to their own.
  useEffect(() => {
    if (!form.fromWarehouse) {
      const first = (warehouseScope || warehouses)[0];
      if (first) setForm((prev) => ({ ...prev, fromWarehouse: first }));
    }
  }, [warehouses, warehouseScope, form.fromWarehouse]);

  // Default "To Warehouse" to the first warehouse that isn't the source.
  useEffect(() => {
    if (form.fromWarehouse && (!form.toWarehouse || form.toWarehouse === form.fromWarehouse)) {
      const next = warehouses.find((w) => w !== form.fromWarehouse) || '';
      setForm((prev) => ({ ...prev, toWarehouse: next }));
    }
  }, [warehouses, form.fromWarehouse, form.toWarehouse]);

  const availableProducts = products.filter(
    (p) => p.warehouse === form.fromWarehouse && p.stock > 0 && !form.items.find((i) => i.productId === p.id)
  );

  const selectedProductBins = binStockByProduct[binStockKey(selectedProduct, form.fromWarehouse)] || [];

  const addItem = () => {
    const product = products.find((p) => p.id === selectedProduct && p.warehouse === form.fromWarehouse);
    if (!product || selectedQty < 1) return;
    const available = availableStock(product.stock, reserved, product.id);
    if (selectedQty > available) {
      setErrors((e) => ({ ...e, items: `Only ${available} unit${available === 1 ? '' : 's'} of "${product.name}" available — the rest is tied up in other pending requests/orders/transfers.` }));
      return;
    }
    setErrors((e) => { const { items, ...rest } = e; return rest; });
    // With more than one bin, the user must pick which one it's coming from;
    // with exactly one, there's nothing to ask — just use it.
    const fromBinLocation = selectedProductBins.length > 1
      ? selectedBin || undefined
      : selectedProductBins[0]?.bin_location || product.bin_location || undefined;
    setForm((f) => ({
      ...f,
      items: [
        ...f.items,
        { productId: product.id, productName: product.name, sku: product.sku, imageUrl: product.image_url || null, quantity: selectedQty, unitPrice: 0, fromBinLocation },
      ],
    }));
    setSelectedProduct('');
    setSelectedQty(1);
    setSelectedBin('');
  };

  const removeItem = (productId: string) => {
    setForm((f) => ({ ...f, items: f.items.filter((i) => i.productId !== productId) }));
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (form.fromWarehouse === form.toWarehouse) e.warehouse = 'Source and destination must be different warehouses.';
    if (!form.reason.trim()) e.reason = 'Reason is required.';
    if (form.items.length === 0) e.items = 'Add at least one product.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = () => {
    if (validate()) onSubmit(form);
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Create Transfer Request</h2>
            <p className="text-sm text-gray-500 mt-0.5">Move stock between warehouses</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors cursor-pointer">
            <i className="ri-close-line text-gray-500"></i>
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1.5">Transfer ID</label>
            <input
              value={form.id}
              onChange={(e) => setForm((f) => ({ ...f, id: e.target.value }))}
              placeholder="TRF-0001"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 placeholder-gray-400"
            />
          </div>

          {/* Warehouse selection */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1.5">From Warehouse</label>
              {warehouseScope && warehouseScope.length === 1 ? (
                <input
                  value={warehouseScope[0]}
                  disabled
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-gray-50 text-gray-500"
                />
              ) : (
                <select
                  value={form.fromWarehouse}
                  onChange={(e) => setForm((f) => ({ ...f, fromWarehouse: e.target.value, items: [] }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 text-gray-800 cursor-pointer"
                >
                  <option value="">Select warehouse…</option>
                  {(warehouseScope || warehouses).map((w) => (
                    <option key={w} value={w}>{w}</option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1.5">To Warehouse</label>
              <select
                value={form.toWarehouse}
                onChange={(e) => setForm((f) => ({ ...f, toWarehouse: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 text-gray-800 cursor-pointer"
              >
                <option value="">Select warehouse…</option>
                {warehouses.filter((w) => w !== form.fromWarehouse).map((w) => (
                  <option key={w} value={w}>{w}</option>
                ))}
              </select>
            </div>
          </div>
          {errors.warehouse && <p className="text-xs text-red-500 -mt-3">{errors.warehouse}</p>}

          {/* Reason + Expected Arrival */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1.5">Reason *</label>
              <input
                type="text"
                value={form.reason}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                placeholder="e.g. Restock low inventory"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 placeholder-gray-400"
              />
              {errors.reason && <p className="text-xs text-red-500 mt-1">{errors.reason}</p>}
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1.5">Expected Arrival</label>
              <input
                type="date"
                value={form.expectedArrival}
                onChange={(e) => setForm((f) => ({ ...f, expectedArrival: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 text-gray-800 cursor-pointer"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1.5">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2}
              maxLength={500}
              placeholder="Optional — any special instructions or remarks"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 placeholder-gray-400 resize-none"
            />
          </div>

          {/* Add Items */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-2">Products to Transfer *</label>
            {loading ? (
              <div className="text-xs text-gray-400 py-2">Loading products...</div>
            ) : (
              <>
                <div className="flex gap-2 mb-3">
                  <select
                    value={selectedProduct}
                    onChange={(e) => { setSelectedProduct(e.target.value); setSelectedBin(lowestQuantityBin(binStockByProduct[binStockKey(e.target.value, form.fromWarehouse)])); }}
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 text-gray-800 cursor-pointer"
                  >
                    <option value="">Select product from {form.fromWarehouse}…</option>
                    {availableProducts.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} ({p.sku}){p.bin_location ? ` — Bin: ${p.bin_location}` : ''} — {availableStock(p.stock, reserved, p.id)} available</option>
                    ))}
                  </select>
                  {selectedProductBins.length > 1 && (
                    <select
                      value={selectedBin}
                      onChange={(e) => setSelectedBin(e.target.value)}
                      className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 text-gray-800 cursor-pointer"
                    >
                      <option value="">From bin…</option>
                      {selectedProductBins.map((b) => (
                        <option key={b.bin_location} value={b.bin_location}>
                          {b.bin_location} ({b.quantity} on hand){b.expiry_date ? ` — Exp ${formatExpiry(b.expiry_date)}` : ''}
                        </option>
                      ))}
                    </select>
                  )}
                  <input
                    type="number"
                    min={1}
                    value={selectedQty === 0 ? '' : selectedQty}
                    onChange={(e) => {
                      // Don't force a fallback to 1 while typing — that snaps the value
                      // back on every keystroke (e.g. while backspacing to clear it)
                      // and fights the user's typing.
                      const val = e.target.value;
                      setSelectedQty(val === '' ? 0 : Math.max(0, Number(val) || 0));
                    }}
                    placeholder="1"
                    className="w-20 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  />
                  <button
                    onClick={addItem}
                    disabled={!selectedProduct || (selectedProductBins.length > 1 && !selectedBin)}
                    className="px-4 py-2.5 bg-emerald-500 text-white text-sm font-medium rounded-lg hover:bg-emerald-600 disabled:opacity-40 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <i className="ri-add-line mr-1"></i>Add
                  </button>
                </div>
              </>
            )}

            {form.items.length > 0 ? (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Product</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">SKU</th>
                      <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Qty</th>
                      <th className="px-3 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {form.items.map((item) => {
                      const matchedProduct = products.find((p) => p.id === item.productId && p.warehouse === form.fromWarehouse);
                      const bin = item.fromBinLocation || matchedProduct?.bin_location;
                      const itemExpiry = binExpiry(binStockByProduct[binStockKey(item.productId, form.fromWarehouse)], bin) ?? matchedProduct?.expiry_date;
                      return (
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
                              <span className="font-medium text-gray-800">{item.productName}</span>
                              {bin && <p className="text-[11px] text-gray-400 font-mono">Bin: {bin}</p>}
                              {itemExpiry && (
                                <p className={`text-[11px] ${expiryTone(itemExpiry)}`}>Exp {formatExpiry(itemExpiry)}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-gray-500 font-mono text-xs">{item.sku}</td>
                        <td className="px-4 py-2.5 text-center text-gray-700">{item.quantity}</td>
                        <td className="px-3 py-2.5 text-right">
                          <button onClick={() => removeItem(item.productId)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors cursor-pointer ml-auto">
                            <i className="ri-delete-bin-line text-sm"></i>
                          </button>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="border border-dashed border-gray-200 rounded-lg py-6 text-center text-sm text-gray-400">
                No products added yet
              </div>
            )}
            {errors.items && <p className="text-xs text-red-500 mt-1">{errors.items}</p>}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer whitespace-nowrap">
            Cancel
          </button>
          <button onClick={handleSubmit} className="px-5 py-2 bg-emerald-500 text-white text-sm font-semibold rounded-lg hover:bg-emerald-600 transition-colors cursor-pointer whitespace-nowrap">
            <i className="ri-send-plane-line mr-1.5"></i>Submit Request
          </button>
        </div>
      </div>
    </div>
  );
}