import { useState } from 'react';
import type { ReturnRequest, ReturnStatus, ReturnCondition, ReturnDecision } from '@/mocks/returns';
import ReturnStatusBadge from './ReturnStatusBadge';
import { useCurrency } from '@/contexts/CurrencyContext';

interface Props {
  ret: ReturnRequest;
  onClose: () => void;
  onUpdate: (id: string, updates: Partial<ReturnRequest>) => void;
}

const conditionOptions: { value: ReturnCondition; label: string; color: string }[] = [
  { value: 'new', label: 'New / Sealed', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  { value: 'good', label: 'Good', color: 'text-sky-700 bg-sky-50 border-sky-200' },
  { value: 'fair', label: 'Fair', color: 'text-amber-700 bg-amber-50 border-amber-200' },
  { value: 'damaged', label: 'Damaged', color: 'text-orange-700 bg-orange-50 border-orange-200' },
  { value: 'defective', label: 'Defective', color: 'text-red-700 bg-red-50 border-red-200' },
];

const decisionOptions: { value: ReturnDecision; label: string; icon: string; color: string }[] = [
  { value: 'restock', label: 'Restock', icon: 'ri-archive-stack-line', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  { value: 'discard', label: 'Discard', icon: 'ri-delete-bin-line', color: 'text-red-600 bg-red-50 border-red-200' },
  { value: 'pending', label: 'Pending', icon: 'ri-time-line', color: 'text-gray-600 bg-gray-100 border-gray-200' },
];

const reasonLabels: Record<string, string> = {
  wrong_item: 'Wrong Item Received',
  damaged: 'Item Arrived Damaged',
  defective: 'Product Defective',
  not_as_described: 'Not As Described',
  changed_mind: 'Customer Changed Mind',
  other: 'Other',
};

const refundMethodLabels: Record<string, string> = {
  original_payment: 'Original Payment Method',
  store_credit: 'Store Credit',
  bank_transfer: 'Bank Transfer',
  none: 'No Refund',
};

const nextStatusMap: Partial<Record<ReturnStatus, { status: ReturnStatus; label: string; icon: string; color: string }>> = {
  pending: { status: 'inspecting', label: 'Start Inspection', icon: 'ri-search-eye-line', color: 'bg-sky-500 hover:bg-sky-600' },
  inspecting: { status: 'approved', label: 'Approve Return', icon: 'ri-checkbox-circle-line', color: 'bg-violet-500 hover:bg-violet-600' },
  approved: { status: 'refunded', label: 'Mark as Refunded', icon: 'ri-refund-2-line', color: 'bg-teal-500 hover:bg-teal-600' },
};

export default function ReturnDetailModal({ ret, onClose, onUpdate }: Props) {
  const { formatAmount } = useCurrency();
  const [items, setItems] = useState(ret.items);
  const [inspectionNotes, setInspectionNotes] = useState(ret.inspectionNotes ?? '');
  const [assignedTo] = useState(ret.assignedTo ?? 'Admin');

  const setCondition = (idx: number, condition: ReturnCondition) => {
    setItems((prev) => prev.map((item, i) => i === idx ? { ...item, condition } : item));
  };

  const setDecision = (idx: number, decision: ReturnDecision) => {
    setItems((prev) => prev.map((item, i) => i === idx ? { ...item, decision } : item));
  };

  const nextAction = nextStatusMap[ret.status];

  const handleAction = () => {
    if (!nextAction) return;
    const newStatus = nextAction.status;
    const restockedItems = items.filter((i) => i.decision === 'restock');
    const isFullyDecided = newStatus === 'approved' && items.every((i) => i.decision && i.decision !== 'pending');

    if (newStatus === 'approved' && !isFullyDecided) return;

    const updates: Partial<ReturnRequest> = {
      status: newStatus,
      items,
      inspectionNotes: inspectionNotes || undefined,
      assignedTo,
      updatedAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
    };

    if (newStatus === 'refunded') {
      updates.completedAt = new Date().toISOString().slice(0, 16).replace('T', ' ');
      if (restockedItems.length > 0) updates.status = 'restocked';
    }

    onUpdate(ret.id, updates);
    onClose();
  };

  const handleFinalizeRestocked = () => {
    onUpdate(ret.id, { status: 'restocked', completedAt: new Date().toISOString().slice(0, 16).replace('T', ' '), updatedAt: new Date().toISOString().slice(0, 16).replace('T', ' ') });
    onClose();
  };

  const handleFinalizeDiscarded = () => {
    onUpdate(ret.id, { status: 'discarded', completedAt: new Date().toISOString().slice(0, 16).replace('T', ' '), updatedAt: new Date().toISOString().slice(0, 16).replace('T', ' ') });
    onClose();
  };

  const handleComplete = () => {
    onUpdate(ret.id, { status: 'returned', completedAt: new Date().toISOString().slice(0, 16).replace('T', ' '), updatedAt: new Date().toISOString().slice(0, 16).replace('T', ' ') });
    onClose();
  };

  // Request-linked returns skip the customer-return inspection/condition workflow —
  // just a single "Complete" action that closes both the return and the source request.
  const isLinked = !!ret.requestId;
  const isEditable = !isLinked && (ret.status === 'pending' || ret.status === 'inspecting');

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-lg" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100">
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-lg font-bold text-gray-900">{ret.id}</h2>
              <ReturnStatusBadge status={ret.status} />
            </div>
            <p className="text-sm text-gray-500 mt-1">
              Order <span className="font-medium text-gray-700">{ret.orderId}</span>
              <span className="mx-2 text-gray-300">·</span>
              <span className="font-medium text-gray-700">{ret.customer}</span>
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 cursor-pointer ml-4">
            <i className="ri-close-line text-gray-500"></i>
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* Info Grid */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="bg-gray-50 rounded-lg p-4 space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Customer</p>
              <div className="flex justify-between"><span className="text-gray-500">Name</span><span className="font-medium text-gray-800">{ret.customer}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Email</span><span className="text-gray-700 text-xs">{ret.email}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Phone</span><span className="text-gray-700 text-xs">{ret.phone}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Warehouse</span><span className="text-gray-700">{ret.warehouse}</span></div>
              {ret.requestId && (
                <div className="flex justify-between"><span className="text-gray-500">Linked Request</span><span className="font-mono text-xs text-emerald-700">{ret.requestId}</span></div>
              )}
            </div>
            <div className="bg-gray-50 rounded-lg p-4 space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Return Details</p>
              <div className="flex justify-between"><span className="text-gray-500">Reason</span><span className="font-medium text-gray-800 text-xs text-right max-w-[120px]">{reasonLabels[ret.reason]}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Refund Method</span><span className="text-gray-700 text-xs text-right max-w-[120px]">{refundMethodLabels[ret.refundMethod]}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Refund Amount</span><span className="font-bold text-gray-900">{formatAmount(ret.refundAmount)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Submitted</span><span className="text-gray-700 text-xs">{ret.createdAt}</span></div>
              {ret.completedAt && <div className="flex justify-between"><span className="text-gray-500">Completed</span><span className="text-emerald-700 text-xs font-medium">{ret.completedAt}</span></div>}
            </div>
          </div>

          {/* Reason Note */}
          {ret.reasonNote && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
              <i className="ri-chat-quote-line mr-2"></i>
              <span className="italic">&ldquo;{ret.reasonNote}&rdquo;</span>
            </div>
          )}

          {/* Items + Condition + Decision */}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-3">Returned Items</p>
            <div className="space-y-3">
              {items.map((item, idx) => (
                <div key={item.productId} className="border border-gray-200 rounded-xl p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0 overflow-hidden">
                        {item.imageUrl ? (
                          <img src={item.imageUrl} alt={item.productName} className="w-full h-full object-cover" />
                        ) : (
                          <i className="ri-box-3-line text-emerald-500 text-xs"></i>
                        )}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-800 text-sm">{item.productName}</p>
                        <p className="text-xs text-gray-400 font-mono mt-0.5">{item.sku} · Qty: {item.quantity} · {formatAmount(item.unitPrice)} each</p>
                      </div>
                    </div>
                    <p className="text-sm font-bold text-gray-900 tracking-tight">{formatAmount(item.quantity * item.unitPrice)}</p>
                  </div>

                  {isEditable && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs font-medium text-gray-600 mb-1.5">Condition</p>
                        <div className="flex flex-wrap gap-1.5">
                          {conditionOptions.map((opt) => (
                            <button
                              key={opt.value}
                              onClick={() => setCondition(idx, opt.value)}
                              className={`px-2.5 py-1 text-xs font-medium rounded-full border cursor-pointer transition-all ${item.condition === opt.value ? opt.color : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-gray-600 mb-1.5">Decision</p>
                        <div className="flex gap-1.5">
                          {decisionOptions.map((opt) => (
                            <button
                              key={opt.value}
                              onClick={() => setDecision(idx, opt.value)}
                              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-full border cursor-pointer transition-all ${item.decision === opt.value ? opt.color : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}
                            >
                              <i className={opt.icon}></i>{opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {!isEditable && (
                    <div className="flex items-center gap-3 mt-1">
                      {item.condition && (
                        <span className={`px-2.5 py-1 text-xs font-medium rounded-full border ${conditionOptions.find((c) => c.value === item.condition)?.color ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                          {conditionOptions.find((c) => c.value === item.condition)?.label}
                        </span>
                      )}
                      {item.decision && item.decision !== 'pending' && (
                        <span className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full border ${item.decision === 'restock' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-600 border-red-200'}`}>
                          <i className={item.decision === 'restock' ? 'ri-archive-stack-line' : 'ri-delete-bin-line'}></i>
                          {item.decision === 'restock' ? 'Restock' : 'Discard'}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Inspection Notes */}
          {(isEditable || ret.inspectionNotes) && (
            <div>
              <label className="text-sm font-semibold text-gray-700 block mb-2">
                Inspection Notes {!isEditable && ret.inspectionNotes ? '' : <span className="text-gray-400 font-normal">(optional)</span>}
              </label>
              {isEditable ? (
                <textarea
                  value={inspectionNotes}
                  onChange={(e) => setInspectionNotes(e.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder="Describe the item condition, defects found, or any remarks…"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 placeholder-gray-400 resize-none"
                />
              ) : (
                <div className="bg-gray-50 rounded-lg px-4 py-3 text-sm text-gray-700 italic">
                  {ret.inspectionNotes}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-100">
          <div className="flex gap-2">
            {!isLinked && ret.status === 'approved' && (
              <>
                <button
                  onClick={handleFinalizeRestocked}
                  className="flex items-center gap-1.5 px-4 py-2 bg-emerald-500 text-white text-sm font-semibold rounded-lg hover:bg-emerald-600 cursor-pointer whitespace-nowrap"
                >
                  <i className="ri-archive-stack-line"></i>Mark Restocked
                </button>
                <button
                  onClick={handleFinalizeDiscarded}
                  className="flex items-center gap-1.5 px-4 py-2 bg-red-500 text-white text-sm font-semibold rounded-lg hover:bg-red-600 cursor-pointer whitespace-nowrap"
                >
                  <i className="ri-delete-bin-line"></i>Mark Discarded
                </button>
              </>
            )}
          </div>
          <div className="flex items-center gap-3 ml-auto">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer whitespace-nowrap">
              Close
            </button>
            {isLinked ? (
              ret.status !== 'returned' && (
                <button
                  onClick={handleComplete}
                  className="flex items-center gap-1.5 px-5 py-2 bg-emerald-500 text-white text-sm font-semibold rounded-lg hover:bg-emerald-600 cursor-pointer whitespace-nowrap"
                >
                  <i className="ri-check-double-line"></i>Complete — Mark Returned
                </button>
              )
            ) : (
              <>
                {nextAction && ret.status !== 'approved' && (
                  <button
                    onClick={handleAction}
                    className={`flex items-center gap-1.5 px-5 py-2 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${nextAction.color}`}
                  >
                    <i className={nextAction.icon}></i>{nextAction.label}
                  </button>
                )}
                {ret.status === 'inspecting' && (
                  <button
                    onClick={handleAction}
                    className="flex items-center gap-1.5 px-5 py-2 bg-violet-500 text-white text-sm font-semibold rounded-lg hover:bg-violet-600 cursor-pointer whitespace-nowrap"
                  >
                    <i className="ri-checkbox-circle-line"></i>Approve Return
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}