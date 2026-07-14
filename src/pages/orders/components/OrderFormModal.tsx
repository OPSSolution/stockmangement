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
  lines: [{ productId: '', quantity: 1 }],
};

export default function OrderFormModal({ products, reserved, initialDraft, title = 'Create Order', submitLabel = 'Create Order', onClose, onSave }: OrderFormModalProps) {
  const { formatAmount } = useCurrency();
  const [draft, setDraft] = useState<OrderCreateDraft>(initialDraft ?? emptyDraft);
  const [error, setError] = useState('');

  useEffect(() => {
    if (initialDraft) {
      setDraft(initialDraft);
    }
  }, [initialDraft]);

  const selectedTotal = draft.lines.reduce((sum, line) => {
    const product = products.find((p) => p.id === line.productId);
    return sum + (product ? product.price * (Number(line.quantity) || 0) : 0);
  }, 0);

  const updateLine = (index: number, field: 'productId' | 'quantity', value: string | number | '') => {
    setDraft((prev) => ({
      ...prev,
      lines: prev.lines.map((line, i) => i === index ? { ...line, [field]: value } : line),
    }));
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
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Items</p>
              <button type="button" onClick={() => setDraft({ ...draft, lines: [...draft.lines, { productId: '', quantity: 1 }] })} className="text-xs font-medium text-emerald-700 hover:underline cursor-pointer">
                + Add item
              </button>
            </div>

            {draft.lines.map((line, index) => {
              const product = products.find((p) => p.id === line.productId);
              return (
                <div key={index} className="grid grid-cols-[1fr_80px_32px] gap-2">
                  <select value={line.productId} onChange={(e) => updateLine(index, 'productId', e.target.value)} className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200">
                    <option value="">Select product</option>
                    {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({availableStock(p.stock, reserved, p.id)} available)</option>)}
                  </select>
                  <input
                    type="number"
                    min={1}
                    max={product ? availableStock(product.stock, reserved, product.id) : undefined}
                    value={line.quantity}
                    onChange={(e) => updateLine(index, 'quantity', e.target.value === '' ? '' : parseInt(e.target.value))}
                    onBlur={() => {
                      if (!line.quantity || Number(line.quantity) < 1) updateLine(index, 'quantity', 1);
                    }}
                    className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  />
                  <button type="button" onClick={() => setDraft({ ...draft, lines: draft.lines.filter((_, i) => i !== index) })} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 cursor-pointer">
                    <i className="ri-delete-bin-line"></i>
                  </button>
                </div>
              );
            })}
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
