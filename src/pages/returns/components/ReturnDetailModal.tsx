import { useEffect, useMemo, useState } from 'react';
import type { ReturnRequest, ReturnStatus, ReturnCondition } from '@/mocks/returns';
import ReturnStatusBadge from './ReturnStatusBadge';
import { useCurrency } from '@/contexts/CurrencyContext';
import { supabase } from '@/lib/supabase';
import { getClaimedReturnQuantities } from '@/lib/returnProgress';

interface Props {
  ret: ReturnRequest;
  /** Every return on the same request, oldest first (including this one) — powers the Return History list. */
  history?: ReturnRequest[];
  onSelectReturn?: (ret: ReturnRequest) => void;
  onClose: () => void;
  onUpdate: (id: string, updates: Partial<ReturnRequest>) => void;
  onCreateFollowUp: (requestId: string) => void;
}

const conditionOptions: { value: ReturnCondition; label: string; color: string }[] = [
  { value: 'new', label: 'New / Sealed', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  { value: 'good', label: 'Good', color: 'text-sky-700 bg-sky-50 border-sky-200' },
  { value: 'fair', label: 'Fair', color: 'text-amber-700 bg-amber-50 border-amber-200' },
  { value: 'damaged', label: 'Damaged', color: 'text-orange-700 bg-orange-50 border-orange-200' },
  { value: 'defective', label: 'Defective', color: 'text-red-700 bg-red-50 border-red-200' },
];

const reasonLabels: Record<string, string> = {
  photoshoot: 'Used for Photoshoot/Project',
  excess: 'Excess / Not Used',
  damaged: 'Damaged During Use',
  consignment: 'Borrowed (Consignment)',
  other: 'Other',
};

const nextStatusMap: Partial<Record<ReturnStatus, { status: ReturnStatus; label: string; icon: string; color: string }>> = {
  pending: { status: 'inspecting', label: 'Start Inspection', icon: 'ri-search-eye-line', color: 'bg-sky-500 hover:bg-sky-600' },
  inspecting: { status: 'approved', label: 'Approve Return', icon: 'ri-checkbox-circle-line', color: 'bg-violet-500 hover:bg-violet-600' },
};

interface RequestProgressItem {
  productId: string;
  productName: string;
  sku: string;
  imageUrl?: string | null;
  requestedQty: number;
  returnedQty: number;
}

export default function ReturnDetailModal({ ret, history, onSelectReturn, onClose, onUpdate, onCreateFollowUp }: Props) {
  const { formatAmount } = useCurrency();
  const [items, setItems] = useState(ret.items);
  const [inspectionNotes, setInspectionNotes] = useState(ret.inspectionNotes ?? '');
  const [assignedTo] = useState(ret.assignedTo ?? 'Admin');
  const [progress, setProgress] = useState<RequestProgressItem[] | null>(null);

  // Always show how much of the source request has been claimed by a return so
  // far (this one plus any others) and how much is still outstanding — this is
  // what tells staff whether more returns are needed for this request.
  useEffect(() => {
    let cancelled = false;
    async function loadProgress() {
      // These two queries are independent — run them together instead of one
      // after the other, which was roughly doubling how long the modal took
      // to show its content.
      const [{ data: reqRow }, claimedMap] = await Promise.all([
        supabase.from('stock_requests').select('items').eq('id', ret.requestId).maybeSingle(),
        getClaimedReturnQuantities(ret.requestId),
      ]);
      const requestedItems = (reqRow?.items as { productId: string; productName: string; sku: string; imageUrl?: string | null; quantity: number }[]) || [];
      if (!cancelled) {
        setProgress(requestedItems.map((i) => ({
          productId: i.productId,
          productName: i.productName,
          sku: i.sku,
          imageUrl: i.imageUrl,
          requestedQty: i.quantity,
          returnedQty: Math.min(i.quantity, claimedMap[i.productId] || 0),
        })));
      }
    }
    loadProgress();
    return () => { cancelled = true; };
  }, [ret.requestId]);

  const setCondition = (idx: number, condition: ReturnCondition) => {
    setItems((prev) => prev.map((item, i) => i === idx ? { ...item, condition } : item));
  };

  const nextAction = nextStatusMap[ret.status];
  const isEditable = ret.status === 'pending' || ret.status === 'inspecting';
  const totalRequested = progress?.reduce((s, i) => s + i.requestedQty, 0) ?? 0;
  const totalReturned = progress?.reduce((s, i) => s + i.returnedQty, 0) ?? 0;
  const unitsLeft = totalRequested - totalReturned;

  // For each return in the history, work out — per product — how many were
  // returned in that specific event and how many were still outstanding right
  // after it, by walking the history oldest-first and accumulating as we go.
  const historyBreakdown = useMemo(() => {
    if (!history || !progress) return [];
    const requestedByProduct: Record<string, number> = {};
    progress.forEach((p) => { requestedByProduct[p.productId] = p.requestedQty; });
    const runningTotal: Record<string, number> = {};
    return history.map((h) => ({
      ret: h,
      items: h.items.map((item) => {
        runningTotal[item.productId] = (runningTotal[item.productId] || 0) + item.quantity;
        const requested = requestedByProduct[item.productId] ?? 0;
        return {
          productName: item.productName,
          quantity: item.quantity,
          notYet: Math.max(0, requested - runningTotal[item.productId]),
        };
      }),
    }));
  }, [history, progress]);

  const handleAction = () => {
    if (!nextAction) return;
    const now = new Date().toLocaleString('sv').replace('T', ' ').slice(0, 16);
    onUpdate(ret.id, {
      status: nextAction.status,
      items,
      inspectionNotes: inspectionNotes || undefined,
      assignedTo,
      updatedAt: now,
    });
    onClose();
  };

  const finalize = (status: 'restocked' | 'discarded') => {
    const now = new Date().toLocaleString('sv').replace('T', ' ').slice(0, 16);
    onUpdate(ret.id, {
      status,
      items,
      inspectionNotes: inspectionNotes || undefined,
      completedAt: now,
      updatedAt: now,
    });
    onClose();
  };

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
              Request <span className="font-medium text-gray-700 font-mono">{ret.requestId}</span>
              <span className="mx-2 text-gray-300">·</span>
              <span className="font-medium text-gray-700">{ret.returnedBy}</span>
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 cursor-pointer ml-4">
            <i className="ri-close-line text-gray-500"></i>
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* Return History — the date/time of every return submitted against
              this request, so multiple partial returns don't need separate
              table rows to tell them apart. */}
          {historyBreakdown.length > 1 && (
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">Return History</p>
              <div className="border border-gray-100 rounded-xl divide-y divide-gray-50 overflow-hidden">
                {[...historyBreakdown].reverse().map(({ ret: h, items: breakdown }) => {
                  const isCurrent = h.id === ret.id;
                  return (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => !isCurrent && onSelectReturn?.(h)}
                      className={`w-full px-3 py-2 text-sm text-left transition-colors ${
                        isCurrent ? 'bg-emerald-50/60 cursor-default' : 'hover:bg-gray-50 cursor-pointer'
                      }`}
                    >
                      <div className={`flex items-center justify-between gap-3 ${isCurrent ? 'font-medium text-emerald-700' : 'text-gray-700'}`}>
                        <span>{h.createdAt}</span>
                        <ReturnStatusBadge status={h.status} />
                      </div>
                      <div className="mt-1 space-y-0.5">
                        {breakdown.map((b) => (
                          <p key={b.productName} className="text-xs text-gray-500">
                            {b.productName} — Returned <span className="font-medium text-gray-800">{b.quantity}</span>
                            <span className="mx-1 text-gray-300">·</span>
                            Not yet <span className={`font-medium ${b.notYet > 0 ? 'text-amber-600' : 'text-gray-800'}`}>{b.notYet}</span>
                          </p>
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Request Progress — how much of the source request has been returned
              so far (across every return on it), and what's left. */}
          {progress && progress.length > 0 && (
            <div className="border border-gray-100 rounded-xl divide-y divide-gray-50 overflow-hidden">
              {progress.map((p) => {
                const left = p.requestedQty - p.returnedQty;
                return (
                  <div key={p.productId} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span className="text-gray-700 truncate">{p.productName}</span>
                    <span className="text-gray-500 shrink-0">
                      Returned <span className="font-medium text-gray-800">{p.returnedQty}</span>
                      <span className="mx-1 text-gray-300">·</span>
                      Not yet <span className={`font-medium ${left > 0 ? 'text-amber-600' : 'text-gray-800'}`}>{left}</span>
                    </span>
                  </div>
                );
              })}
              {unitsLeft > 0 && (
                <button
                  onClick={() => onCreateFollowUp(ret.requestId)}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-50 cursor-pointer"
                >
                  <i className="ri-add-line"></i>Start Next Return
                </button>
              )}
            </div>
          )}

          {/* Info Grid */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="bg-gray-50 rounded-lg p-4 space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Returned By</p>
              <div className="flex justify-between"><span className="text-gray-500">Staff</span><span className="font-medium text-gray-800">{ret.returnedBy}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Warehouse</span><span className="text-gray-700">{ret.warehouse}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Linked Request</span><span className="font-mono text-xs text-emerald-700">{ret.requestId}</span></div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Return Details</p>
              <div className="flex justify-between"><span className="text-gray-500">Reason</span><span className="font-medium text-gray-800 text-xs text-right max-w-[140px]">{reasonLabels[ret.reason]}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Stock Value</span><span className="font-bold text-gray-900">{formatAmount(ret.totalValue)}</span></div>
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

          {/* Items + Condition */}
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

                  {isEditable ? (
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
                  ) : (
                    item.condition && (
                      <span className={`px-2.5 py-1 text-xs font-medium rounded-full border ${conditionOptions.find((c) => c.value === item.condition)?.color ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                        {conditionOptions.find((c) => c.value === item.condition)?.label}
                      </span>
                    )
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
            {ret.status === 'approved' && (
              <>
                <button
                  onClick={() => finalize('restocked')}
                  className="flex items-center gap-1.5 px-4 py-2 bg-emerald-500 text-white text-sm font-semibold rounded-lg hover:bg-emerald-600 cursor-pointer whitespace-nowrap"
                >
                  <i className="ri-archive-stack-line"></i>Mark Restocked
                </button>
                <button
                  onClick={() => finalize('discarded')}
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
            {nextAction && (
              <button
                onClick={handleAction}
                className={`flex items-center gap-1.5 px-5 py-2 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${nextAction.color}`}
              >
                <i className={nextAction.icon}></i>{nextAction.label}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
