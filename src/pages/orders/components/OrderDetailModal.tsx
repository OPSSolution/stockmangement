import { useState } from 'react';
import { Order, VendorSplit, OrderItem } from '@/mocks/orders';
import OrderStatusBadge from './OrderStatusBadge';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useAuth } from '@/contexts/AuthContext';
import { deductStockForItems } from '@/lib/stockDeduction';
import { downloadPdf, type PdfTableSpec } from '@/lib/exportPdf';

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
  const { isAdmin, canApprove } = useAuth();
  const canDecide = isAdmin || canApprove('orders');
  const [splits, setSplits] = useState<VendorSplit[]>(order.vendorSplits);
  const [partialQty, setPartialQty] = useState<Record<string, number>>({});
  const [confirmMsg, setConfirmMsg] = useState('');
  const [confirming, setConfirming] = useState(false);
  const isPending = order.status === 'pending';

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

  const handlePartialQty = (itemId: string, val: number, max: number) => {
    setPartialQty((prev) => ({ ...prev, [itemId]: Math.min(Math.max(0, val), max) }));
  };

  const computeNewStatus = (s: VendorSplit[]): Order['status'] => {
    const allAccepted = s.every((v) => v.status === 'accepted');
    const allRejected = s.every((v) => v.status === 'rejected');
    // A split that's itself 'partial' (mixed accept/reject within one vendor) must
    // also count here — otherwise an order with one partially-decided vendor split
    // silently falls through to 'pending' even though real decisions were made.
    const anyDecided = s.some((v) => v.status === 'accepted' || v.status === 'partial');
    if (allAccepted) return 'accepted';
    if (allRejected) return 'rejected';
    if (anyDecided) return 'partial';
    return 'pending';
  };

  const handleConfirm = async () => {
    if (!canDecide) return;

    // Confirming the order is a decision on every item — anything the reviewer
    // never individually touched (still 'pending') is treated as accepted, so
    // clicking Confirm without picking through each item still works as a
    // straightforward "approve this order" action.
    const resolvedSplits = splits.map((s) => ({
      ...s,
      items: s.items.map((i) => (i.status === 'pending' ? { ...i, status: 'accepted' as const } : i)),
    }));
    resolvedSplits.forEach((s) => {
      const allAccepted = s.items.every((i) => i.status === 'accepted');
      const allRejected = s.items.every((i) => i.status === 'rejected');
      const someAccepted = s.items.some((i) => i.status === 'accepted');
      s.status = allAccepted ? 'accepted' : allRejected ? 'rejected' : someAccepted ? 'partial' : 'pending';
    });

    const newStatus = computeNewStatus(resolvedSplits);

    // Stock only leaves the warehouse for items newly accepted this confirm — already-accepted
    // items (from a prior confirm) aren't re-deducted, and rejected items never touch stock.
    const newlyAccepted: { productId: string; quantity: number }[] = [];
    resolvedSplits.forEach((split, si) => {
      const prevItems = order.vendorSplits[si]?.items || [];
      split.items.forEach((item) => {
        const prevStatus = prevItems.find((i) => i.id === item.id)?.status;
        if (item.status === 'accepted' && prevStatus !== 'accepted') {
          newlyAccepted.push({ productId: item.productId, quantity: item.quantity });
        }
      });
    });

    if (newlyAccepted.length > 0) {
      setConfirming(true);
      const { error } = await deductStockForItems(newlyAccepted, {
        reference: order.id,
        note: `Order ${order.id} accepted`,
        userName: 'Admin',
        historyType: 'sale',
      });
      setConfirming(false);
      if (error) {
        setConfirmMsg('Cannot confirm: ' + error);
        return;
      }
    }

    const updated: Order = { ...order, vendorSplits: resolvedSplits, status: newStatus, updatedAt: new Date().toLocaleString('sv').replace('T', ' ').slice(0, 16) };
    onUpdateOrder(updated);
    onClose();
  };

  const handleDownloadPdf = () => {
    const totalItems = splits.reduce((s, split) => s + split.items.reduce((si, i) => si + i.quantity, 0), 0);
    const tables: PdfTableSpec[] = splits.map((split) => ({
      title: `${split.vendor} · ${split.warehouse}`,
      head: ['Product', 'SKU', 'Qty', 'Unit Price', 'Total', 'Status'],
      rows: split.items.map((item) => [
        item.productName,
        item.sku,
        item.quantity,
        formatAmount(item.unitPrice),
        formatAmount(item.unitPrice * item.quantity),
        item.status.replace(/^\w/, (c) => c.toUpperCase()),
      ]),
      colStyles: { 2: { halign: 'center' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
      footRow: [{ content: 'Split Subtotal', colSpan: 4, styles: { halign: 'right' } }, formatAmount(split.subtotal), ''],
    }));

    downloadPdf(
      {
        docType: 'Purchase Order',
        docId: order.id,
        status: order.status,
        subtitle: `${order.customer} · ${order.city}`,
        infoBoxes: [
          {
            title: 'Customer',
            rows: [
              { label: 'Email', value: order.email },
              { label: 'Phone', value: order.phone },
              { label: 'Address', value: `${order.address}, ${order.city}` },
              { label: 'Ordered', value: order.createdAt },
            ],
          },
          {
            title: 'Summary',
            rows: [
              { label: 'Vendor Splits', value: String(splits.length) },
              { label: 'Total Items', value: String(totalItems) },
              { label: 'Order Total', value: formatAmount(order.total) },
            ],
          },
        ],
        notes: order.notes ? [{ label: 'Notes', text: order.notes, tone: 'amber' }] : undefined,
        tables,
        footerLeft: `Requested by ${order.customer}`,
      },
      `${order.id}.pdf`
    );
  };

  const handleReject = () => {
    if (!canDecide) return;
    const rejectedSplits = splits.map((s) => ({ ...s, status: 'rejected' as const, items: s.items.map((i) => ({ ...i, status: 'rejected' as const })) }));
    const updated: Order = { ...order, vendorSplits: rejectedSplits, status: 'rejected', updatedAt: new Date().toLocaleString('sv').replace('T', ' ').slice(0, 16) };
    onUpdateOrder(updated);
    onClose();
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
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button onClick={handleDownloadPdf} className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 cursor-pointer whitespace-nowrap">
              <i className="ri-file-pdf-2-line"></i>Download PDF
            </button>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 cursor-pointer">
              <i className="ri-close-line text-lg"></i>
            </button>
          </div>
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
            <div className={`mb-3 text-xs font-medium px-3 py-2 rounded-lg flex items-center gap-2 ${confirmMsg.startsWith('Cannot confirm') ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'}`}>
              <i className={confirmMsg.startsWith('Cannot confirm') ? 'ri-error-warning-line' : 'ri-check-double-line'}></i> {confirmMsg}
            </div>
          )}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-400">Order Total</p>
              <p className="text-lg font-bold text-gray-900">{formatAmount(order.total)}</p>
            </div>
            {isPending && (
              <div className="flex items-center gap-3">
                <button
                  onClick={handleReject}
                  disabled={confirming || !canDecide}
                  title={canDecide ? undefined : "You don't have permission to approve or reject orders"}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                    canDecide
                      ? 'text-red-600 bg-white border border-red-200 hover:bg-red-50 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed'
                      : 'text-gray-400 bg-gray-100 border border-gray-200 cursor-not-allowed'
                  }`}
                >
                  Reject
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={confirming || !canDecide}
                  title={canDecide ? undefined : "You don't have permission to approve or reject orders"}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                    canDecide
                      ? 'text-white bg-emerald-500 hover:bg-emerald-600 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed'
                      : 'text-gray-400 bg-gray-200 cursor-not-allowed'
                  }`}
                >
                  {confirming ? 'Confirming...' : 'Confirm Decisions'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
