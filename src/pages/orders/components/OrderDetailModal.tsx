import { useState } from 'react';
import { Order, VendorSplit, OrderItem } from '@/mocks/orders';
import OrderStatusBadge from './OrderStatusBadge';
import { useCurrency } from '@/contexts/CurrencyContext';

interface OrderDetailModalProps {
  order: Order;
  onClose: () => void;
  onUpdateOrder: (updated: Order) => void;
}

const vendorStatusColors: Record<string, string> = {
  pending: 'border-amber-200 bg-amber-50/40',
  accepted: 'border-emerald-200 bg-emerald-50/30',
  rejected: 'border-red-200 bg-red-50/30',
  partial: 'border-sky-200 bg-sky-50/30',
};

export default function OrderDetailModal({ order, onClose, onUpdateOrder }: OrderDetailModalProps) {
  const { formatAmount } = useCurrency();
  const [splits, setSplits] = useState<VendorSplit[]>(order.vendorSplits);
  const [partialQty, setPartialQty] = useState<Record<string, number>>({});
  const [confirmMsg, setConfirmMsg] = useState('');

  const updateItemStatus = (splitIdx: number, itemId: string, status: OrderItem['status']) => {
    setSplits((prev) =>
      prev.map((s, si) => {
        if (si !== splitIdx) return s;
        const updatedItems = s.items.map((item) => (item.id === itemId ? { ...item, status } : item));
        const allAccepted = updatedItems.every((i) => i.status === 'accepted');
        const allRejected = updatedItems.every((i) => i.status === 'rejected');
        const someAccepted = updatedItems.some((i) => i.status === 'accepted');
        const vendorStatus = allAccepted ? 'accepted' : allRejected ? 'rejected' : someAccepted ? 'partial' : 'pending';
        return { ...s, items: updatedItems, status: vendorStatus as VendorSplit['status'] };
      })
    );
  };

  const acceptAllSplit = (splitIdx: number) => {
    setSplits((prev) =>
      prev.map((s, si) =>
        si !== splitIdx ? s : { ...s, status: 'accepted', items: s.items.map((i) => ({ ...i, status: 'accepted' })) }
      )
    );
  };

  const rejectAllSplit = (splitIdx: number) => {
    setSplits((prev) =>
      prev.map((s, si) =>
        si !== splitIdx ? s : { ...s, status: 'rejected', items: s.items.map((i) => ({ ...i, status: 'rejected' })) }
      )
    );
  };

  const handlePartialQty = (itemId: string, val: number, max: number) => {
    setPartialQty((prev) => ({ ...prev, [itemId]: Math.min(Math.max(0, val), max) }));
  };

  const computeNewStatus = (s: VendorSplit[]): Order['status'] => {
    const allAccepted = s.every((v) => v.status === 'accepted');
    const allRejected = s.every((v) => v.status === 'rejected');
    const someAccepted = s.some((v) => v.status === 'accepted');
    if (allAccepted) return 'accepted';
    if (allRejected) return 'rejected';
    if (someAccepted) return 'partial';
    return 'pending';
  };

  const handleConfirm = () => {
    const newStatus = computeNewStatus(splits);
    const updated: Order = { ...order, vendorSplits: splits, status: newStatus, updatedAt: new Date().toLocaleString('sv').replace('T', ' ').slice(0, 16) };
    onUpdateOrder(updated);
    setConfirmMsg(`Order updated to: ${newStatus}`);
    setTimeout(() => { setConfirmMsg(''); onClose(); }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-2xl mx-4 shadow-xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100 shrink-0">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-base font-bold text-gray-900">{order.id}</h2>
              <OrderStatusBadge status={order.status} />
            </div>
            <p className="text-xs text-gray-400 mt-0.5">{order.customer} · {order.city} · {order.createdAt}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 cursor-pointer">
            <i className="ri-close-line text-lg"></i>
          </button>
        </div>

        {/* Customer info */}
        <div className="px-6 py-3 bg-gray-50/60 border-b border-gray-100 shrink-0">
          <div className="flex flex-wrap gap-6 text-sm">
            <div className="flex items-center gap-2 text-gray-500">
              <i className="ri-user-line text-gray-400"></i>
              <span>Requested by {order.customer}</span>
            </div>
            <div className="flex items-center gap-2 text-gray-500">
              <i className="ri-mail-line text-gray-400"></i>
              <span>{order.email}</span>
            </div>
            <div className="flex items-center gap-2 text-gray-500">
              <i className="ri-phone-line text-gray-400"></i>
              <span>{order.phone}</span>
            </div>
            <div className="flex items-center gap-2 text-gray-500">
              <i className="ri-map-pin-line text-gray-400"></i>
              <span>{order.address}, {order.city}</span>
            </div>
          </div>
          {order.notes && (
            <div className="mt-2 flex items-start gap-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
              <i className="ri-information-line mt-0.5"></i>
              <span>{order.notes}</span>
            </div>
          )}
        </div>

        {/* Vendor splits */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Vendor Splits ({splits.length})</p>
          {splits.map((split, si) => (
            <div key={si} className={`rounded-xl border p-4 ${vendorStatusColors[split.status] ?? 'border-gray-200'}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 flex items-center justify-center rounded-md bg-white border border-gray-200">
                    <i className="ri-store-2-line text-gray-500 text-sm"></i>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{split.vendor}</p>
                    <p className="text-xs text-gray-400">{split.warehouse}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    split.status === 'accepted' ? 'bg-emerald-50 text-emerald-700' :
                    split.status === 'rejected' ? 'bg-red-50 text-red-600' :
                    split.status === 'partial' ? 'bg-sky-50 text-sky-700' :
                    'bg-amber-50 text-amber-700'
                  }`}>{split.status.charAt(0).toUpperCase() + split.status.slice(1)}</span>
                  <button onClick={() => acceptAllSplit(si)} className="px-2.5 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100 cursor-pointer whitespace-nowrap">Accept All</button>
                  <button onClick={() => rejectAllSplit(si)} className="px-2.5 py-1 text-xs font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 cursor-pointer whitespace-nowrap">Reject All</button>
                </div>
              </div>

              {/* Items */}
              <div className="space-y-2">
                {split.items.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 bg-white rounded-lg px-3 py-2.5 border border-gray-100">
                    <div className="w-7 h-7 flex items-center justify-center rounded-md bg-gray-50 overflow-hidden">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt={item.productName} className="w-full h-full object-cover" />
                      ) : (
                        <i className="ri-box-3-line text-gray-400 text-sm"></i>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 leading-tight truncate">{item.productName}</p>
                      <p className="text-xs text-gray-400">{item.sku} · Available: {item.availableQty}</p>
                    </div>

                    {/* Partial qty input */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-gray-400">Qty:</span>
                      <input
                        type="number"
                        min={0}
                        max={item.quantity}
                        value={partialQty[item.id] ?? item.quantity}
                        onChange={(e) => handlePartialQty(item.id, parseInt(e.target.value) || 0, item.quantity)}
                        className="w-14 text-center text-xs border border-gray-200 rounded-md py-1 focus:outline-none focus:ring-1 focus:ring-emerald-300"
                      />
                      <span className="text-xs text-gray-400">/ {item.quantity}</span>
                    </div>

                    <span className="text-sm font-semibold text-gray-700 whitespace-nowrap">{formatAmount(item.unitPrice * item.quantity)}</span>

                    {/* Item-level accept/reject */}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => updateItemStatus(si, item.id, 'accepted')}
                        className={`w-7 h-7 flex items-center justify-center rounded-md cursor-pointer transition-colors ${item.status === 'accepted' ? 'bg-emerald-100 text-emerald-700' : 'hover:bg-emerald-50 text-gray-400'}`}
                        title="Accept"
                      >
                        <i className="ri-check-line text-sm"></i>
                      </button>
                      <button
                        onClick={() => updateItemStatus(si, item.id, 'rejected')}
                        className={`w-7 h-7 flex items-center justify-center rounded-md cursor-pointer transition-colors ${item.status === 'rejected' ? 'bg-red-100 text-red-600' : 'hover:bg-red-50 text-gray-400'}`}
                        title="Reject"
                      >
                        <i className="ri-close-line text-sm"></i>
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Subtotal */}
              <div className="flex items-center justify-end mt-3 pt-2 border-t border-dashed border-gray-200">
                <span className="text-xs text-gray-400 mr-2">Split Subtotal:</span>
                <span className="text-sm font-bold text-gray-800">{formatAmount(split.subtotal)}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 shrink-0">
          {confirmMsg && (
            <div className="mb-3 bg-emerald-50 text-emerald-700 text-xs font-medium px-3 py-2 rounded-lg flex items-center gap-2">
              <i className="ri-check-double-line"></i> {confirmMsg}
            </div>
          )}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-400">Order Total</p>
              <p className="text-lg font-bold text-gray-900">{formatAmount(order.total)}</p>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer whitespace-nowrap">
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                className="px-4 py-2 text-sm font-medium text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 transition-colors cursor-pointer whitespace-nowrap"
              >
                Confirm Decisions
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}