import type { StockTransfer, TransferStatus } from '@/mocks/transfers';
import TransferStatusBadge from './TransferStatusBadge';
import { useCurrency } from '@/contexts/CurrencyContext';

interface TransferDetailModalProps {
  transfer: StockTransfer;
  onClose: () => void;
  onStatusChange: (id: string, status: TransferStatus) => void;
  /** Only the sending warehouse (or an admin) may approve a transfer or mark it in transit. */
  isSendingWarehouse: boolean;
  /** Only the receiving warehouse (or an admin) may confirm a transfer as received. */
  isReceivingWarehouse: boolean;
  statusChanging: boolean;
}

const steps: { key: TransferStatus; label: string; icon: string }[] = [
  { key: 'requested', label: 'Requested', icon: 'ri-time-line' },
  { key: 'approved', label: 'Approved', icon: 'ri-checkbox-circle-line' },
  { key: 'in_transit', label: 'In Transit', icon: 'ri-truck-line' },
  { key: 'received', label: 'Received', icon: 'ri-check-double-line' },
];

const stepOrder = ['requested', 'approved', 'in_transit', 'received'];

function getNextStatus(current: TransferStatus): TransferStatus | null {
  const idx = stepOrder.indexOf(current);
  if (idx === -1 || idx >= stepOrder.length - 1) return null;
  return stepOrder[idx + 1] as TransferStatus;
}

export default function TransferDetailModal({ transfer, onClose, onStatusChange, isSendingWarehouse, isReceivingWarehouse, statusChanging }: TransferDetailModalProps) {
  const { formatAmount } = useCurrency();
  const currentIdx = stepOrder.indexOf(transfer.status);
  const nextStatus = getNextStatus(transfer.status);
  const isCancelled = transfer.status === 'cancelled';

  const nextLabel: Record<string, string> = {
    requested: 'Approve Transfer',
    approved: 'Mark In Transit',
    in_transit: 'Confirm Received',
  };

  const totalValue = transfer.items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100">
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-lg font-bold text-gray-900">{transfer.id}</h2>
              <TransferStatusBadge status={transfer.status} />
            </div>
            <p className="text-sm text-gray-500 mt-1">
              <span className="font-medium text-gray-700">{transfer.fromWarehouse}</span>
              <i className="ri-arrow-right-line mx-2 text-gray-400"></i>
              <span className="font-medium text-gray-700">{transfer.toWarehouse}</span>
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors cursor-pointer ml-4">
            <i className="ri-close-line text-gray-500"></i>
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* Progress Tracker */}
          {!isCancelled && (
            <div className="flex items-center gap-0">
              {steps.map((step, idx) => {
                const done = idx <= currentIdx;
                const active = idx === currentIdx;
                return (
                  <div key={step.key} className="flex items-center flex-1 last:flex-none">
                    <div className="flex flex-col items-center">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm transition-all ${
                        done ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-400'
                      } ${active ? 'ring-4 ring-emerald-100' : ''}`}>
                        <i className={step.icon}></i>
                      </div>
                      <span className={`text-xs mt-1.5 font-medium whitespace-nowrap ${done ? 'text-emerald-700' : 'text-gray-400'}`}>
                        {step.label}
                      </span>
                    </div>
                    {idx < steps.length - 1 && (
                      <div className={`flex-1 h-0.5 mb-5 mx-1 ${idx < currentIdx ? 'bg-emerald-400' : 'bg-gray-200'}`}></div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Info Grid */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="bg-gray-50 rounded-lg p-4 space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Transfer Info</p>
              <div className="flex justify-between"><span className="text-gray-500">Requested by</span><span className="font-medium text-gray-800">{transfer.requestedBy}</span></div>
              {transfer.approvedBy && <div className="flex justify-between"><span className="text-gray-500">Approved by</span><span className="font-medium text-gray-800">{transfer.approvedBy}</span></div>}
              <div className="flex justify-between"><span className="text-gray-500">Created</span><span className="text-gray-700">{transfer.createdAt}</span></div>
              {transfer.expectedArrival && <div className="flex justify-between"><span className="text-gray-500">Expected</span><span className="text-gray-700">{transfer.expectedArrival}</span></div>}
              {transfer.completedAt && <div className="flex justify-between"><span className="text-gray-500">Completed</span><span className="text-emerald-700 font-medium">{transfer.completedAt}</span></div>}
            </div>
            <div className="bg-gray-50 rounded-lg p-4 space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Summary</p>
              <div className="flex justify-between"><span className="text-gray-500">Total SKUs</span><span className="font-medium text-gray-800">{transfer.items.length}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Total Units</span><span className="font-medium text-gray-800">{transfer.totalItems}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Est. Value</span><span className="font-bold text-gray-800">{formatAmount(totalValue)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Reason</span><span className="text-gray-700 text-right max-w-[140px] truncate">{transfer.reason}</span></div>
            </div>
          </div>

          {/* Items Table */}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-2">Transfer Items</p>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Product</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">SKU</th>
                    <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Qty</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Unit Price</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {transfer.items.map((item) => (
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
                          <span className="font-medium text-gray-800">{item.productName}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-500 font-mono text-xs">{item.sku}</td>
                      <td className="px-4 py-3 text-center text-gray-700">{item.quantity}</td>
                      <td className="px-4 py-3 text-right text-gray-600">{formatAmount(item.unitPrice)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-800">{formatAmount(item.quantity * item.unitPrice)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 border-t border-gray-200">
                  <tr>
                    <td colSpan={4} className="px-4 py-2.5 text-sm font-semibold text-right text-gray-600">Total Value</td>
                    <td className="px-4 py-2.5 text-right font-bold text-gray-900">{formatAmount(totalValue)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Notes */}
          {transfer.notes && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
              <i className="ri-sticky-note-line mr-2"></i>{transfer.notes}
            </div>
          )}

          {/* Action */}
          {!isCancelled && nextStatus && (() => {
            const canAct = nextStatus === 'received' ? isReceivingWarehouse : isSendingWarehouse;
            return (
            <div className="bg-gray-50 rounded-lg p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-800">Next Action</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {nextStatus === 'approved' && (canAct
                    ? 'Approve this transfer request to allow dispatch.'
                    : `Only ${transfer.fromWarehouse} can approve this transfer.`)}
                  {nextStatus === 'in_transit' && (canAct
                    ? 'Mark as In Transit once stock has left the source warehouse.'
                    : `Only ${transfer.fromWarehouse} can mark this transfer in transit.`)}
                  {nextStatus === 'received' && (canAct
                    ? 'Confirm received once stock arrives at destination.'
                    : `Only ${transfer.toWarehouse} can confirm receipt of this transfer.`)}
                </p>
              </div>
              {canAct && (
                <button
                  onClick={() => onStatusChange(transfer.id, nextStatus)}
                  disabled={statusChanging}
                  className="px-5 py-2.5 bg-emerald-500 text-white text-sm font-semibold rounded-lg hover:bg-emerald-600 transition-colors cursor-pointer whitespace-nowrap ml-4 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <i className={`${statusChanging ? 'ri-loader-4-line animate-spin' : 'ri-check-line'} mr-1.5`}></i>
                  {statusChanging ? 'Updating…' : nextLabel[transfer.status]}
                </button>
              )}
            </div>
            );
          })()}

          {!isCancelled && transfer.status === 'requested' && (
            <div className="flex justify-end">
              <button
                onClick={() => onStatusChange(transfer.id, 'cancelled')}
                className="text-xs text-red-500 hover:text-red-700 underline cursor-pointer"
              >
                Cancel this transfer
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}