import { useEffect, useState } from 'react';
import type { ProductStockRow } from '@/mocks/inventory';
import { supabase } from '@/lib/supabase';
import { buildOrderInsert, mapProductRow, type OrderCreateDraft, type OrderLineDraft } from '../orders/orderCreateUtils';
import { logAudit } from '@/lib/auditLog';
import { notifyAdmins } from '@/lib/notifyAdmins';
import { expirySuffix } from '@/lib/expiry';

const emptyDraft: OrderCreateDraft = {
  requestedBy: '',
  customer: '',
  email: '',
  phone: '',
  address: '',
  city: '',
  notes: '',
  lines: [{ productId: '', quantity: 1 }],
  orderType: 'regular',
};

export default function PublicOrderFormPage() {
  const [products, setProducts] = useState<ProductStockRow[]>([]);
  const [draft, setDraft] = useState<OrderCreateDraft>(emptyDraft);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const fetchProducts = async () => {
      const { data, error } = await supabase.from('product_warehouse_stock').select('*, product:products(*)');
      if (error) {
        setStatus({ type: 'error', msg: 'Unable to load products.' });
        return;
      }
      // A customer doesn't pick a warehouse, so a SKU stocked in several warehouses
      // must collapse into one catalog entry — fulfillment auto-picks the warehouse
      // with the most stock, so that's the row shown and ordered against here.
      const bestByProduct = new Map<string, ProductStockRow>();
      (data || []).filter((row) => row.product).map(mapProductRow).forEach((row) => {
        const existing = bestByProduct.get(row.id);
        if (!existing || row.stock > existing.stock) bestByProduct.set(row.id, row);
      });
      setProducts(Array.from(bestByProduct.values()).filter((p) => p.stock > 0).sort((a, b) => a.name.localeCompare(b.name)));
    };
    fetchProducts();
  }, []);

  const updateLine = (index: number, field: 'productId' | 'quantity', value: string | number | '') => {
    setDraft((prev) => ({
      ...prev,
      lines: prev.lines.map((line, i): OrderLineDraft => {
        if (i !== index) return line;
        if (field === 'productId') {
          const productId = value as string;
          return { ...line, productId, warehouse: products.find((p) => p.id === productId)?.warehouse };
        }
        return { ...line, quantity: value as number | '' };
      }),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus(null);

    if (!draft.requestedBy.trim() || !draft.customer.trim() || !draft.email.trim() || !draft.phone.trim() || !draft.address.trim() || !draft.city.trim()) {
      setStatus({ type: 'error', msg: 'Please fill all contact and delivery details.' });
      return;
    }
    if (!draft.lines.some((line) => line.productId && Number(line.quantity) > 0)) {
      setStatus({ type: 'error', msg: 'Please choose at least one product.' });
      return;
    }

    setSubmitting(true);
    const payload = buildOrderInsert(draft, products);
    const { error } = await supabase.from('orders').insert(payload);
    setSubmitting(false);

    if (error) {
      console.error(error);
      setStatus({ type: 'error', msg: 'Could not submit the order. Please try again.' });
      return;
    }

    setDraft(emptyDraft);
    setStatus({ type: 'success', msg: 'Order submitted. The team will review it soon.' });
    logAudit({ action: 'create', module: 'orders', description: `Public order form submitted by ${draft.customer} (requested by ${draft.requestedBy})` });
    notifyAdmins(
      'new_order',
      'New Order',
      `${draft.customer} placed an order for ${payload.item_count} item${payload.item_count !== 1 ? 's' : ''} via the public order form.`,
      { order_id: payload.id }
    );
  };

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-2xl bg-white rounded-2xl shadow-sm border border-gray-100">
        <div className="px-6 py-5 border-b border-gray-100">
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">Order Request</h1>
          <p className="text-sm text-gray-500 mt-1">Submit your order details for review.</p>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input value={draft.requestedBy} onChange={(e) => setDraft({ ...draft, requestedBy: e.target.value })} placeholder="Requested by" className="md:col-span-2 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200" />
            <input value={draft.customer} onChange={(e) => setDraft({ ...draft, customer: e.target.value })} placeholder="Full name" className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200" />
            <input value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} type="email" placeholder="Email" className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200" />
            <input value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} placeholder="Phone" className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200" />
            <input value={draft.city} onChange={(e) => setDraft({ ...draft, city: e.target.value })} placeholder="City" className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200" />
            <input value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} placeholder="Delivery address" className="md:col-span-2 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200" />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Products</p>
              <button type="button" onClick={() => setDraft({ ...draft, lines: [...draft.lines, { productId: '', quantity: 1 }] })} className="text-xs font-medium text-emerald-700 hover:underline cursor-pointer">+ Add product</button>
            </div>
            {draft.lines.map((line, index) => (
              <div key={index} className="grid grid-cols-[1fr_80px_32px] gap-2">
                <select value={line.productId} onChange={(e) => updateLine(index, 'productId', e.target.value)} className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200">
                  <option value="">Select product</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name} - ${p.price.toFixed(2)}{expirySuffix(p.expiryDate)}</option>)}
                </select>
                <input
                  type="number"
                  min={1}
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
            ))}
          </div>

          <textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} rows={4} placeholder="Notes or delivery instructions" className="w-full resize-none px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200" />

          {status && (
            <div className={`text-sm rounded-lg px-3 py-2 ${status.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
              {status.msg}
            </div>
          )}

          <button disabled={submitting} className="w-full py-2.5 text-sm font-medium text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 disabled:opacity-60 cursor-pointer">
            {submitting ? 'Submitting...' : 'Submit Order'}
          </button>
        </form>
      </div>
    </main>
  );
}
