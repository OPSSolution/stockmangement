import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useCurrency } from '@/contexts/CurrencyContext';

interface NewPOItem {
  productId: string;
  productName: string;
  sku: string;
  imageUrl?: string | null;
  orderedQty: number;
  receivedQty: number;
  unitCost: number;
}

interface FormData {
  vendor: string;
  vendorContact: string;
  vendorEmail: string;
  warehouse: 'BM Warehouse' | 'Vendor Warehouse';
  notes: string;
  expectedDelivery: string;
  items: NewPOItem[];
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
  price: number;
}

interface VendorOption {
  name: string;
  contacts: { name: string; email: string }[];
  payment_terms: string;
}

export default function PurchaseFormModal({ onClose, onSubmit }: Props) {
  const { formatAmount } = useCurrency();
  const [form, setForm] = useState<FormData>({
    vendor: '',
    vendorContact: '',
    vendorEmail: '',
    warehouse: 'BM Warehouse',
    notes: '',
    expectedDelivery: '',
    items: [],
  });
  const [selectedProduct, setSelectedProduct] = useState('');
  const [selectedQty, setSelectedQty] = useState(1);
  const [selectedCost, setSelectedCost] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const [prodRes, vendRes] = await Promise.all([
      supabase.from('products').select('id, name, sku, image_url, price'),
      supabase.from('vendors').select('name, contacts, payment_terms'),
    ]);
    if (prodRes.error) console.error(prodRes.error);
    else setProducts((prodRes.data || []).map((p) => ({ id: p.id, name: p.name, sku: p.sku, image_url: p.image_url, price: p.price })));
    if (vendRes.error) console.error(vendRes.error);
    else setVendors((vendRes.data || []).map((v) => ({ name: v.name, contacts: v.contacts || [], payment_terms: v.payment_terms })));
    setLoading(false);
  };

  const selectedVendorData = vendors.find((v) => v.name === form.vendor);

  const handleVendorChange = (name: string) => {
    const v = vendors.find((vnd) => vnd.name === name);
    setForm((f) => ({
      ...f,
      vendor: name,
      vendorContact: v?.contacts[0]?.name ?? '',
      vendorEmail: v?.contacts[0]?.email ?? '',
      items: [],
    }));
    setSelectedProduct('');
  };

  const productOptions = products.filter((p) => !form.items.find((i) => i.productId === p.id));

  const handleProductSelect = (id: string) => {
    setSelectedProduct(id);
    const p = products.find((prod) => prod.id === id);
    if (p) setSelectedCost(p.price * 0.6);
  };

  const addItem = () => {
    const product = products.find((p) => p.id === selectedProduct);
    if (!product) return;
    setForm((f) => ({
      ...f,
      items: [
        ...f.items,
        { productId: product.id, productName: product.name, sku: product.sku, imageUrl: product.image_url || null, orderedQty: selectedQty, receivedQty: 0, unitCost: selectedCost },
      ],
    }));
    setSelectedProduct('');
    setSelectedQty(1);
    setSelectedCost(0);
  };

  const removeItem = (productId: string) => {
    setForm((f) => ({ ...f, items: f.items.filter((i) => i.productId !== productId) }));
  };

  const subtotal = form.items.reduce((sum, i) => sum + i.orderedQty * i.unitCost, 0);
  const tax = subtotal * 0.06;
  const total = subtotal + tax;

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.vendor) e.vendor = 'Please select a vendor.';
    if (form.items.length === 0) e.items = 'Add at least one product.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = () => {
    if (validate()) onSubmit(form);
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-lg" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Create Purchase Order</h2>
            <p className="text-sm text-gray-500 mt-0.5">Submit a new purchase order to a vendor</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 cursor-pointer">
            <i className="ri-close-line text-gray-500"></i>
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Vendor Selection */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1.5">Vendor *</label>
              <select
                value={form.vendor}
                onChange={(e) => handleVendorChange(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 text-gray-800 cursor-pointer"
              >
                <option value="">Select vendor…</option>
                {loading ? <option>Loading…</option> : vendors.map((v) => (
                  <option key={v.name} value={v.name}>{v.name}</option>
                ))}
              </select>
              {errors.vendor && <p className="text-xs text-red-500 mt-1">{errors.vendor}</p>}
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1.5">Deliver to Warehouse</label>
              <select
                value={form.warehouse}
                onChange={(e) => setForm((f) => ({ ...f, warehouse: e.target.value as typeof f.warehouse }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 text-gray-800 cursor-pointer"
              >
                <option value="BM Warehouse">BM Warehouse</option>
                <option value="Vendor Warehouse">Vendor Warehouse</option>
              </select>
            </div>
          </div>

          {selectedVendorData && (
            <div className="bg-emerald-50 rounded-lg px-4 py-3 text-sm flex items-center gap-4">
              <div className="w-8 h-8 flex items-center justify-center bg-emerald-100 rounded-full">
                <i className="ri-store-2-line text-emerald-600"></i>
              </div>
              <div>
                <p className="font-semibold text-gray-800">{selectedVendorData.name}</p>
                <p className="text-xs text-gray-500">{selectedVendorData.contacts[0]?.name} · {selectedVendorData.contacts[0]?.email} · {selectedVendorData.payment_terms}</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1.5">Expected Delivery</label>
              <input
                type="date"
                value={form.expectedDelivery}
                onChange={(e) => setForm((f) => ({ ...f, expectedDelivery: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 cursor-pointer"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1.5">Notes</label>
              <input
                type="text"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Optional notes…"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 placeholder-gray-400"
              />
            </div>
          </div>

          {/* Items */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-2">Order Items *</label>
            {loading ? (
              <div className="text-xs text-gray-400 py-2">Loading products...</div>
            ) : (
              <>
                <div className="flex gap-2 mb-3 flex-wrap">
                  <select
                    value={selectedProduct}
                    onChange={(e) => handleProductSelect(e.target.value)}
                    className="flex-1 min-w-40 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 cursor-pointer"
                  >
                    <option value="">Select product…</option>
                    {productOptions.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={1}
                    value={selectedQty}
                    onChange={(e) => setSelectedQty(Number(e.target.value))}
                    placeholder="Qty"
                    className="w-20 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  />
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={selectedCost}
                    onChange={(e) => setSelectedCost(Number(e.target.value))}
                    placeholder="Unit cost"
                    className="w-28 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
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
                      <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Qty</th>
                      <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Unit Cost</th>
                      <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Total</th>
                      <th className="px-3"></th>
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
                            <div>
                              <p className="font-medium text-gray-800 text-sm">{item.productName}</p>
                              <p className="text-xs text-gray-400 font-mono">{item.sku}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-center text-gray-700">{item.orderedQty}</td>
                        <td className="px-4 py-2.5 text-right text-gray-600">{formatAmount(item.unitCost)}</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-gray-800">{formatAmount(item.orderedQty * item.unitCost)}</td>
                        <td className="px-3 py-2.5">
                          <button onClick={() => removeItem(item.productId)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-50 text-gray-400 hover:text-red-500 cursor-pointer">
                            <i className="ri-delete-bin-line text-sm"></i>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t border-gray-200 divide-y divide-gray-100">
                    <tr>
                      <td colSpan={3} className="px-4 py-2 text-sm text-right text-gray-500">Subtotal</td>
                      <td className="px-4 py-2 text-right text-sm font-semibold text-gray-800" colSpan={2}>{formatAmount(subtotal)}</td>
                    </tr>
                    <tr>
                      <td colSpan={3} className="px-4 py-2 text-sm text-right text-gray-500">Tax (6%)</td>
                      <td className="px-4 py-2 text-right text-sm text-gray-700" colSpan={2}>{formatAmount(tax)}</td>
                    </tr>
                    <tr>
                      <td colSpan={3} className="px-4 py-2.5 text-sm font-bold text-right text-gray-800">Total</td>
                      <td className="px-4 py-2.5 text-right font-bold text-emerald-700" colSpan={2}>{formatAmount(total)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <div className="border border-dashed border-gray-200 rounded-lg py-6 text-center text-sm text-gray-400">
                No items added yet
              </div>
            )}
            {errors.items && <p className="text-xs text-red-500 mt-1">{errors.items}</p>}
          </div>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer whitespace-nowrap">
            Cancel
          </button>
          <button onClick={handleSubmit} className="px-5 py-2 bg-emerald-500 text-white text-sm font-semibold rounded-lg hover:bg-emerald-600 cursor-pointer whitespace-nowrap">
            <i className="ri-send-plane-line mr-1.5"></i>Submit PO
          </button>
        </div>
      </div>
    </div>
  );
}