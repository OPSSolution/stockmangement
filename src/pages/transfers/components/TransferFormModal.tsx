import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { getReservedQuantities, availableStock } from '@/lib/stockReservations';

interface NewTransferItem {
  productId: string;
  productName: string;
  sku: string;
  imageUrl?: string | null;
  quantity: number;
  unitPrice: number;
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
}

export default function TransferFormModal({ onClose, onSubmit }: TransferFormModalProps) {
  const { warehouseScope } = useAuth();
  const [form, setForm] = useState<FormData>(emptyForm(warehouseScope?.[0] || ''));
  const [selectedProduct, setSelectedProduct] = useState('');
  const [selectedQty, setSelectedQty] = useState(1);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [products, setProducts] = useState<ProductOption[]>([]);
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
      const { data, error } = await supabase.from('products').select('id, name, sku, image_url, stock, warehouse');
      if (error) console.error(error);
      else setProducts((data || []).map((p) => ({ id: p.id, name: p.name, sku: p.sku, image_url: p.image_url, stock: p.stock, warehouse: p.warehouse })));
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

  const addItem = () => {
    const product = products.find((p) => p.id === selectedProduct);
    if (!product || selectedQty < 1) return;
    const available = availableStock(product.stock, reserved, product.id);
    if (selectedQty > available) {
      setErrors((e) => ({ ...e, items: `Only ${available} unit${available === 1 ? '' : 's'} of "${product.name}" available — the rest is tied up in other pending requests/orders/transfers.` }));
      return;
    }
    setErrors((e) => { const { items, ...rest } = e; return rest; });
    setForm((f) => ({
      ...f,
      items: [
        ...f.items,
        { productId: product.id, productName: product.name, sku: product.sku, imageUrl: product.image_url || null, quantity: selectedQty, unitPrice: 0 },
      ],
    }));
    setSelectedProduct('');
    setSelectedQty(1);
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
                    onChange={(e) => setSelectedProduct(e.target.value)}
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 text-gray-800 cursor-pointer"
                  >
                    <option value="">Select product from {form.fromWarehouse}…</option>
                    {availableProducts.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} ({p.sku}) — {availableStock(p.stock, reserved, p.id)} available</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={1}
                    value={selectedQty}
                    onChange={(e) => setSelectedQty(Math.max(1, Number(e.target.value) || 1))}
                    className="w-20 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  />
                  <button
                    onClick={addItem}
                    disabled={!selectedProduct}
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
                    {form.items.map((item) => (
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
                            <span className="font-medium text-gray-800">{item.productName}</span>
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
                    ))}
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