import { useState } from 'react';
import type { PurchaseOrder, PurchaseStatus } from '@/mocks/purchases';
import PurchaseStatusBadge from './PurchaseStatusBadge';
import { useCurrency } from '@/contexts/CurrencyContext';

interface Props {
  po: PurchaseOrder;
  onClose: () => void;
  onStatusChange: (id: string, status: PurchaseStatus, receiptData?: { receivedQty: Record<string, number> }) => void;
}

const workflow: { from: PurchaseStatus; to: PurchaseStatus; label: string; icon: string; color: string }[] = [
  { from: 'submitted', to: 'approved', label: 'Approve PO', icon: 'ri-checkbox-circle-line', color: 'bg-sky-500 hover:bg-sky-600' },
  { from: 'approved', to: 'ordered', label: 'Mark as Ordered', icon: 'ri-shopping-cart-2-line', color: 'bg-violet-500 hover:bg-violet-600' },
  { from: 'ordered', to: 'received', label: 'Confirm Receipt', icon: 'ri-check-double-line', color: 'bg-emerald-500 hover:bg-emerald-600' },
];

export default function PurchaseDetailModal({ po, onClose, onStatusChange }: Props) {
  const { formatAmount } = useCurrency();
  const [receivedQty, setReceivedQty] = useState<Record<string, number>>(
    Object.fromEntries(po.items.map((i) => [i.productId, i.orderedQty]))
  );

  const action = workflow.find((w) => w.from === po.status);
  const isReceiving = po.status === 'ordered';

  const handleAction = () => {
    if (!action) return;
    onStatusChange(po.id, action.to, isReceiving ? { receivedQty } : undefined);
  };

  const handleCancel = () => onStatusChange(po.id, 'cancelled');

  const subtotal = po.items.reduce((sum, i) => sum + i.orderedQty * i.unitCost, 0);

  const stepOrder: PurchaseStatus[] = ['draft', 'submitted', 'approved', 'ordered', 'received'];
  const steps = [
    { key: 'submitted', label: 'Submitted', icon: 'ri-send-plane-line' },
    { key: 'approved', label: 'Approved', icon: 'ri-checkbox-circle-line' },
    { key: 'ordered', label: 'Ordered', icon: 'ri-shopping-cart-2-line' },
    { key: 'received', label: 'Received', icon: 'ri-check-double-line' },
  ];
  const currentIdx = stepOrder.indexOf(po.status);
  const isActive = (key: string) => stepOrder.indexOf(key as PurchaseStatus) <= currentIdx;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-lg" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100">
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-lg font-bold text-gray-900">{po.id}</h2>
              <PurchaseStatusBadge status={po.status} />
            </div>
            <p className="text-sm text-gray-500 mt-1">
              Vendor: <span className="font-medium text-gray-700">{po.vendor}</span>
              <span className="mx-2 text-gray-300">·</span>
              Warehouse: <span className="font-medium text-gray-700">{po.warehouse}</span>
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 cursor-pointer ml-4">
            <i className="ri-close-line text-gray-500"></i>
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* Progress Tracker */}
          {po.status !== 'cancelled' && po.status !== 'draft' && (
            <div className="flex items-center gap-0">
              {steps.map((step, idx) => {
                const done = isActive(step.key);
                const active = step.key === po.status;
                return (
                  <div key={step.key} className="flex items-center flex-1 last:flex-none">
                    <div className="flex flex-col items-center">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm transition-all ${done ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-400'} ${active ? 'ring-4 ring-emerald-100' : ''}`}>
                        <i className={step.icon}></i>
                      </div>
                      <span className={`text-xs mt-1.5 font-medium whitespace-nowrap ${done ? 'text-emerald-700' : 'text-gray-400'}`}>{step.label}</span>
                    </div>
                    {idx < steps.length - 1 && (
                      <div className={`flex-1 h-0.5 mb-5 mx-1 ${isActive(steps[idx + 1].key) ? 'bg-emerald-400' : 'bg-gray-200'}`}></div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Info Grid */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="bg-gray-50 rounded-lg p-4 space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Vendor Info</p>
              <div className="flex justify-between"><span className="text-gray-500">Name</span><span className="font-medium text-gray-800">{po.vendor}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Contact</span><span className="text-gray-700">{po.vendorContact}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Email</span><span className="text-gray-700 text-xs">{po.vendorEmail}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Requested by</span><span className="text-gray-700">{po.requestedBy}</span></div>
              {po.approvedBy && <div className="flex justify-between"><span className="text-gray-500">Approved by</span><span className="text-gray-700">{po.approvedBy}</span></div>}
            </div>
            <div className="bg-gray-50 rounded-lg p-4 space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Order Info</p>
              <div className="flex justify-between"><span className="text-gray-500">Created</span><span className="text-gray-700">{po.createdAt}</span></div>
              {po.expectedDelivery && <div className="flex justify-between"><span className="text-gray-500">Expected</span><span className="text-gray-700">{po.expectedDelivery}</span></div>}
              {po.receivedAt && <div className="flex justify-between"><span className="text-gray-500">Received</span><span className="text-emerald-700 font-medium">{po.receivedAt}</span></div>}
              <div className="flex justify-between"><span className="text-gray-500">Warehouse</span><span className="text-gray-700">{po.warehouse}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Total</span><span className="font-bold text-gray-900">{formatAmount(po.total)}</span></div>
            </div>
          </div>

          {/* Items Table */}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-2">Order Items</p>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Product</th>
                    <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Ordered</th>
                    {isReceiving && <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Received</th>}
                    {po.status === 'received' && <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Received</th>}
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Unit Cost</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {po.items.map((item) => (
                    <tr key={item.productId} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0 overflow-hidden">
                            {item.imageUrl ? (
                              <img src={item.imageUrl} alt={item.productName} className="w-full h-full object-cover" />
                            ) : (
                              <i className="ri-box-3-line text-emerald-500 text-xs"></i>
                            )}
                          </div>
                          <div>
                            <p className="font-medium text-gray-800">{item.productName}</p>
                            <p className="text-xs text-gray-400 font-mono">{item.sku}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center text-gray-700">{item.orderedQty}</td>
                      {isReceiving && (
                        <td className="px-3 py-3 text-center">
                          <input
                            type="number"
                            min={0}
                            max={item.orderedQty}
                            value={receivedQty[item.productId] ?? item.orderedQty}
                            onChange={(e) => setReceivedQty((prev) => ({ ...prev, [item.productId]: Number(e.target.value) }))}
                            className="w-20 border border-gray-200 rounded-lg px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-emerald-400"
                          />
                        </td>
                      )}
                      {po.status === 'received' && (
                        <td className="px-3 py-3 text-center">
                          <span className={`font-semibold ${item.receivedQty === item.orderedQty ? 'text-emerald-600' : 'text-amber-600'}`}>
                            {item.receivedQty}
                          </span>
                        </td>
                      )}
                      <td className="px-4 py-3 text-right text-gray-600">{formatAmount(item.unitCost)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-800">{formatAmount(item.orderedQty * item.unitCost)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 border-t border-gray-200 divide-y divide-gray-100">
                  <tr>
                    <td colSpan={isReceiving || po.status === 'received' ? 4 : 3} className="px-4 py-2 text-sm text-right text-gray-500">Subtotal</td>
                    <td className="px-4 py-2 text-right text-sm font-semibold text-gray-800">{formatAmount(subtotal)}</td>
                  </tr>
                  <tr>
                    <td colSpan={isReceiving || po.status === 'received' ? 4 : 3} className="px-4 py-2 text-sm text-right text-gray-500">Tax (6%)</td>
                    <td className="px-4 py-2 text-right text-sm text-gray-700">{formatAmount(po.tax)}</td>
                  </tr>
                  <tr>
                    <td colSpan={isReceiving || po.status === 'received' ? 4 : 3} className="px-4 py-2.5 text-sm font-bold text-right text-gray-800">Total</td>
                    <td className="px-4 py-2.5 text-right font-bold text-emerald-700">{formatAmount(po.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Notes */}
          {po.notes && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
              <i className="ri-sticky-note-line mr-2"></i>{po.notes}
            </div>
          )}

          {/* Receipt confirmation note */}
          {isReceiving && (
            <div className="bg-sky-50 border border-sky-200 rounded-lg px-4 py-3 text-sm text-sky-800">
              <i className="ri-information-line mr-2"></i>
              Enter the actual received quantity for each item. Stock will be auto-updated upon confirmation.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-100">
          {(po.status === 'submitted' || po.status === 'approved') && (
            <button
              onClick={handleCancel}
              className="text-xs text-red-500 hover:text-red-700 underline cursor-pointer"
            >
              Cancel PO
            </button>
          )}
          <div className="flex gap-3 ml-auto">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer whitespace-nowrap">
              Close
            </button>
            {action && po.status !== 'cancelled' && (
              <button
                onClick={handleAction}
                className={`px-5 py-2 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${action.color}`}
              >
                <i className={`${action.icon} mr-1.5`}></i>{action.label}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}