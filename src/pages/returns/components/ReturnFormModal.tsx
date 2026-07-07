import { useMemo, useState } from 'react';
import type { RefundMethod, ReturnItem, ReturnReason, ReturnRequest, ReturnStatus } from '@/mocks/returns';
import { useCurrency } from '@/contexts/CurrencyContext';

interface Props {
  ret?: ReturnRequest;
  onClose: () => void;
  onSave: (ret: ReturnRequest) => void;
}

const inputClass = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-300';

const statusOptions: { value: ReturnStatus; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'inspecting', label: 'Inspecting' },
  { value: 'approved', label: 'Approved' },
  { value: 'restocked', label: 'Restocked' },
  { value: 'discarded', label: 'Discarded' },
  { value: 'refunded', label: 'Refunded' },
];

const reasonOptions: { value: ReturnReason; label: string }[] = [
  { value: 'wrong_item', label: 'Wrong Item' },
  { value: 'damaged', label: 'Damaged' },
  { value: 'defective', label: 'Defective' },
  { value: 'not_as_described', label: 'Not As Described' },
  { value: 'changed_mind', label: 'Changed Mind' },
  { value: 'other', label: 'Other' },
];

const refundMethodOptions: { value: RefundMethod; label: string }[] = [
  { value: 'original_payment', label: 'Original Payment' },
  { value: 'store_credit', label: 'Store Credit' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'none', label: 'No Refund' },
];

const emptyItem: ReturnItem = {
  productId: '',
  productName: '',
  sku: '',
  quantity: 1,
  unitPrice: 0,
};

export default function ReturnFormModal({ ret, onClose, onSave }: Props) {
  const { formatAmount } = useCurrency();
  const [form, setForm] = useState({
    orderId: ret?.orderId ?? '',
    customer: ret?.customer ?? '',
    email: ret?.email ?? '',
    phone: ret?.phone ?? '',
    status: ret?.status ?? 'pending' as ReturnStatus,
    reason: ret?.reason ?? 'wrong_item' as ReturnReason,
    reasonNote: ret?.reasonNote ?? '',
    refundMethod: ret?.refundMethod ?? 'original_payment' as RefundMethod,
    warehouse: ret?.warehouse ?? 'BM Warehouse' as ReturnRequest['warehouse'],
    assignedTo: ret?.assignedTo ?? '',
    inspectionNotes: ret?.inspectionNotes ?? '',
    completedAt: ret?.completedAt ?? '',
    items: ret?.items.length ? ret.items : [{ ...emptyItem }],
  });
  const [error, setError] = useState('');

  const totalItems = useMemo(() => form.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0), [form.items]);
  const totalValue = useMemo(() => form.items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0), 0), [form.items]);
  const refundAmount = form.refundMethod === 'none' ? 0 : totalValue;

  const updateItem = (index: number, updates: Partial<ReturnItem>) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...updates } : item),
    }));
  };

  const removeItem = (index: number) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const handleSubmit = () => {
    if (!form.orderId.trim() || !form.customer.trim() || !form.email.trim()) {
      setError('Please fill in order, customer, and email.');
      return;
    }

    if (form.items.length === 0 || form.items.some((item) => !item.productName.trim() || !item.sku.trim() || item.quantity < 1)) {
      setError('Please add at least one valid returned item.');
      return;
    }

    const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const completedAt = ['restocked', 'discarded', 'refunded'].includes(form.status)
      ? form.completedAt || ret?.completedAt || now
      : undefined;

    onSave({
      id: ret?.id || '',
      orderId: form.orderId.trim(),
      customer: form.customer.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      status: form.status,
      items: form.items.map((item) => ({
        ...item,
        productId: item.productId.trim() || item.sku.trim(),
        productName: item.productName.trim(),
        sku: item.sku.trim(),
        quantity: Number(item.quantity || 1),
        unitPrice: Number(item.unitPrice || 0),
      })),
      totalItems,
      totalValue,
      reason: form.reason,
      reasonNote: form.reasonNote.trim() || undefined,
      refundMethod: form.refundMethod,
      refundAmount,
      warehouse: form.warehouse,
      assignedTo: form.assignedTo.trim() || undefined,
      inspectionNotes: form.inspectionNotes.trim() || undefined,
      createdAt: ret?.createdAt || now,
      updatedAt: now,
      completedAt,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-4xl mx-4 shadow-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-base font-bold text-gray-900">{ret ? 'Edit Return' : 'Create Return'}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{ret ? ret.id : 'Add a new customer return request'}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 cursor-pointer">
            <i className="ri-close-line text-lg"></i>
          </button>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <section className="space-y-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Return details</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Order ID</label>
                <input value={form.orderId} onChange={(e) => setForm((prev) => ({ ...prev, orderId: e.target.value }))} placeholder="ORD-0001" className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Status</label>
                <select value={form.status} onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value as ReturnStatus }))} className={inputClass}>
                  {statusOptions.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Warehouse</label>
                <select value={form.warehouse} onChange={(e) => setForm((prev) => ({ ...prev, warehouse: e.target.value as ReturnRequest['warehouse'] }))} className={inputClass}>
                  <option value="BM Warehouse">BM Warehouse</option>
                  <option value="Vendor Warehouse">Vendor Warehouse</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Reason</label>
                <select value={form.reason} onChange={(e) => setForm((prev) => ({ ...prev, reason: e.target.value as ReturnReason }))} className={inputClass}>
                  {reasonOptions.map((reason) => <option key={reason.value} value={reason.value}>{reason.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Refund Method</label>
                <select value={form.refundMethod} onChange={(e) => setForm((prev) => ({ ...prev, refundMethod: e.target.value as RefundMethod }))} className={inputClass}>
                  {refundMethodOptions.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Assigned To</label>
                <input value={form.assignedTo} onChange={(e) => setForm((prev) => ({ ...prev, assignedTo: e.target.value }))} placeholder="Admin" className={inputClass} />
              </div>
              <div className="md:col-span-3">
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Reason Note</label>
                <textarea value={form.reasonNote} onChange={(e) => setForm((prev) => ({ ...prev, reasonNote: e.target.value }))} rows={2} placeholder="Customer note or return explanation" className={`${inputClass} resize-none`} />
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Customer</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Name</label>
                <input value={form.customer} onChange={(e) => setForm((prev) => ({ ...prev, customer: e.target.value }))} placeholder="Customer name" className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Email</label>
                <input type="email" value={form.email} onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))} placeholder="customer@email.com" className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Phone</label>
                <input value={form.phone} onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))} placeholder="+60..." className={inputClass} />
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Returned items</p>
              <button type="button" onClick={() => setForm((prev) => ({ ...prev, items: [...prev.items, { ...emptyItem }] }))} className="text-xs font-medium text-emerald-700 hover:underline cursor-pointer">
                + Add item
              </button>
            </div>
            <div className="space-y-3">
              {form.items.map((item, index) => (
                <div key={index} className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr_90px_120px_36px] gap-2 items-end">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Product</label>
                    <input value={item.productName} onChange={(e) => updateItem(index, { productName: e.target.value })} placeholder="Product name" className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">SKU</label>
                    <input value={item.sku} onChange={(e) => updateItem(index, { sku: e.target.value })} placeholder="SKU" className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Qty</label>
                    <input type="number" min={1} value={item.quantity} onChange={(e) => updateItem(index, { quantity: Math.max(1, Number(e.target.value) || 1) })} className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Unit Price</label>
                    <input type="number" min={0} step="0.01" value={item.unitPrice} onChange={(e) => updateItem(index, { unitPrice: Math.max(0, Number(e.target.value) || 0) })} className={inputClass} />
                  </div>
                  <button type="button" onClick={() => removeItem(index)} disabled={form.items.length === 1} className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-40 cursor-pointer">
                    <i className="ri-delete-bin-line"></i>
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-end gap-5 text-sm">
              <span className="text-gray-500">Items: <span className="font-semibold text-gray-800">{totalItems}</span></span>
              <span className="text-gray-500">Refund: <span className="font-bold text-gray-900">{formatAmount(refundAmount)}</span></span>
            </div>
          </section>

          <section>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Inspection Notes</label>
            <textarea value={form.inspectionNotes} onChange={(e) => setForm((prev) => ({ ...prev, inspectionNotes: e.target.value }))} rows={3} placeholder="Inspection result or internal notes" className={`${inputClass} resize-none`} />
          </section>

          {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-3">{error}</div>}
        </form>

        <div className="px-6 py-4 border-t border-gray-100 shrink-0 flex items-center justify-between">
          <p className="text-xs text-gray-400">{ret ? 'Save changes to this return' : 'Create return request'}</p>
          <div className="flex items-center gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">Cancel</button>
            <button type="submit" onClick={handleSubmit} className="px-4 py-2 text-sm font-medium text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 cursor-pointer">{ret ? 'Save Changes' : 'Create Return'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
