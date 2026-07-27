import { useState, useEffect } from 'react';
import type { Product } from '@/mocks/inventory';
import type { OrderCreateDraft } from '../orderCreateUtils';
import { useCurrency } from '@/contexts/CurrencyContext';
import { availableStock } from '@/lib/stockReservations';

interface OrderFormModalProps {
  products: Product[];
  /** productId -> quantity already tied up in other pending requests/orders/transfers. */
  reserved: Record<string, number>;
  initialDraft?: OrderCreateDraft;
  title?: string;
  submitLabel?: string;
  onClose: () => void;
  onSave: (draft: OrderCreateDraft) => void;
}

const emptyDraft: OrderCreateDraft = {
  requestedBy: '',
  customer: '',
  email: '',
  phone: '',
  address: '',
  city: '',
  notes: '',
  lines: [],
};

export default function OrderFormModal({ products, reserved, initialDraft, title = 'Create Order', submitLabel = 'Create Order', onClose, onSave }: OrderFormModalProps) {
  const { formatAmount } = useCurrency();
  const [draft, setDraft] = useState<OrderCreateDraft>(initialDraft ?? emptyDraft);
  const [error, setError] = useState('');
  const [pickerWarehouse, setPickerWarehouse] = useState('');
  const [pickerProduct, setPickerProduct] = useState('');
  const [pickerQty, setPickerQty] = useState(1);

  useEffect(() => {
    if (initialDraft) {
      setDraft(initialDraft);
    }
  }, [initialDraft]);

  const selectedTotal = draft.lines.reduce((sum, line) => {
    const product = products.find((p) => p.id === line.productId);
    return sum + (product ? product.price * (Number(line.quantity) || 0) : 0);
  }, 0);

  const selectedWarehouses = Array.from(new Set(
    draft.lines
      .map((line) => products.find((p) => p.id === line.productId)?.warehouse)
      .filter((w): w is string => Boolean(w))
  ));

  const warehouseOptions = Array.from(new Set(products.map((p) => p.warehouse))).sort();

  // Products already added don't show up again in the picker — one line per product.
  const pickerProducts = pickerWarehouse
    ? products.filter((p) => p.warehouse === pickerWarehouse && !draft.lines.some((l) => l.productId === p.id))
    : [];
  const pickerProductObj = products.find((p) => p.id === pickerProduct);

  const handleAddItem = () => {
    if (!pickerProduct) return;
    setDraft((prev) => ({ ...prev, lines: [...prev.lines, { productId: pickerProduct, quantity: pickerQty, warehouse: pickerWarehouse }] }));
    setPickerProduct('');
    setPickerQty(1);
  };

  const handleRemoveItem = (index: number) => {
    setDraft((prev) => ({ ...prev, lines: prev.lines.filter((_, i) => i !== index) }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.requestedBy.trim() || !draft.customer.trim() || !draft.email.trim() || !draft.phone.trim() || !draft.address.trim() || !draft.city.trim()) {
      setError('Please fill requester and customer details.');
      return;
    }
    if (!draft.lines.some((line) => line.productId && Number(line.quantity) > 0)) {
      setError('Please add at least one product.');
      return;
    }
    const overCommitted = draft.lines.find((line) => {
      if (!line.productId) return false;
      const product = products.find((p) => p.id === line.productId);
      if (!product) return false;
      return Number(line.quantity) > availableStock(product.stock, reserved, product.id);
    });
    if (overCommitted) {
      const product = products.find((p) => p.id === overCommitted.productId);
      const available = product ? availableStock(product.stock, reserved, product.id) : 0;
      setError(`Only ${available} unit${available === 1 ? '' : 's'} of "${product?.name}" available — the rest is tied up in other pending requests/orders/transfers.`);
      return;
    }
    setError('');
    onSave(draft);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-2xl mx-4 shadow-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-base font-bold text-gray-900">{title}</h2>
            <p className="text-xs text-gray-400 mt-0.5">Admin-created order for review and fulfillment.</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 cursor-pointer">
            <i className="ri-close-line text-lg"></i>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input value={draft.requestedBy} onChange={(e) => setDraft({ ...draft, requestedBy: e.target.value })} placeholder="Created/requested by" className="md:col-span-2 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200" />
            <input value={draft.customer} onChange={(e) => setDraft({ ...draft, customer: e.target.value })} placeholder="Customer name" className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200" />
            <input value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} placeholder="Email" type="email" className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200" />
            <input value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} placeholder="Phone" className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200" />
            <input value={draft.city} onChange={(e) => setDraft({ ...draft, city: e.target.value })} placeholder="City" className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200" />
            <input value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} placeholder="Address" className="md:col-span-2 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200" />
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Items</p>
            {selectedWarehouses.length > 1 && (
              <p className="text-[11px] text-sky-700 bg-sky-50 rounded-lg px-2.5 py-1.5">
                <i className="ri-information-line mr-1"></i>
                Items span {selectedWarehouses.length} warehouses ({selectedWarehouses.join(', ')}) — this order will be split into a separate fulfillment group per warehouse.
              </p>
            )}

            {/* Picker — select warehouse, then product, then quantity, then Add */}
            <div className="flex gap-2 flex-wrap">
              <select
                value={pickerWarehouse}
                onChange={(e) => { setPickerWarehouse(e.target.value); setPickerProduct(''); }}
                className="w-36 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 cursor-pointer"
              >
                <option value="">Warehouse</option>
                {warehouseOptions.map((w) => <option key={w} value={w}>{w}</option>)}
              </select>
              <select
                value={pickerProduct}
                onChange={(e) => setPickerProduct(e.target.value)}
                disabled={!pickerWarehouse}
                className="flex-1 min-w-40 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 cursor-pointer disabled:bg-gray-50 disabled:text-gray-400"
              >
                <option value="">{pickerWarehouse ? 'Select product' : 'Select warehouse first'}</option>
                {pickerProducts.map((p) => <option key={p.id} value={p.id}>{p.name}{p.binLocation ? ` (Bin: ${p.binLocation})` : ''} — {availableStock(p.stock, reserved, p.id)} available</option>)}
              </select>
              <input
                type="number"
                min={1}
                max={pickerProductObj ? availableStock(pickerProductObj.stock, reserved, pickerProductObj.id) : undefined}
                value={pickerQty}
                onChange={(e) => setPickerQty(e.target.value === '' ? 1 : parseInt(e.target.value))}
                className="w-20 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-emerald-200"
              />
              <button
                type="button"
                onClick={handleAddItem}
                disabled={!pickerProduct}
                className="px-4 py-2.5 bg-emerald-500 text-white text-sm font-medium rounded-lg hover:bg-emerald-600 disabled:opacity-40 transition-colors cursor-pointer whitespace-nowrap"
              >
                <i className="ri-add-line mr-1"></i>Add
              </button>
            </div>

            {/* Added items */}
            {draft.lines.length > 0 ? (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-3 py-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Product</th>
                      <th className="text-center px-3 py-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Qty</th>
                      <th className="text-right px-3 py-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Price</th>
                      <th className="text-right px-3 py-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Total</th>
                      <th className="px-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {draft.lines.map((line, index) => {
                      const product = products.find((p) => p.id === line.productId);
                      return (
                        <tr key={index}>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0 overflow-hidden">
                                {product?.imageUrl ? (
                                  <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
                                ) : (
                                  <i className="ri-box-3-line text-emerald-500 text-xs"></i>
                                )}
                              </div>
                              <div>
                                <p className="font-medium text-gray-800">{product?.name ?? '—'}</p>
                                <p className="text-[11px] text-gray-400">
                                  {product?.sku} · {product?.warehouse ?? line.warehouse}
                                  {product?.binLocation && <> · <span className="font-mono">Bin: {product.binLocation}</span></>}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-center text-gray-700">{line.quantity}</td>
                          <td className="px-3 py-2.5 text-right text-gray-600">{formatAmount(product?.price ?? 0)}</td>
                          <td className="px-3 py-2.5 text-right font-semibold text-gray-800">{formatAmount((product?.price ?? 0) * (Number(line.quantity) || 0))}</td>
                          <td className="px-2 py-2.5 text-right">
                            <button type="button" onClick={() => handleRemoveItem(index)} className="w-7 h-7 flex items-center justify-center rounded hover:bg-red-50 text-gray-400 hover:text-red-500 cursor-pointer">
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
                No items added yet
              </div>
            )}
          </div>

          <textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} rows={3} placeholder="Notes..." className="w-full resize-none px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200" />

          {error && <div className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>}
        </form>

        <div className="px-6 py-4 border-t border-gray-100 shrink-0 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400">Order Total</p>
            <p className="text-lg font-bold text-gray-900">{formatAmount(selectedTotal)}</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">Cancel</button>
            <button onClick={handleSubmit} className="px-4 py-2 text-sm font-medium text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 cursor-pointer">{submitLabel}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
