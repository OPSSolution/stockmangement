import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReturnItem, ReturnReason, ReturnRequest, ReturnStatus } from '@/mocks/returns';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { getClaimedReturnQuantities } from '@/lib/returnProgress';

interface RequestOptionItem {
  productId: string;
  productName: string;
  sku: string;
  imageUrl?: string | null;
  originalQty: number;
  alreadyClaimed: number;
  remaining: number;
}

interface RequestOption {
  id: string;
  requestedBy: string;
  warehouse: string;
  status: string;
  items: RequestOptionItem[];
}

interface Props {
  ret?: ReturnRequest;
  /** Pre-select this request on open — used when starting a follow-up return for units left over from an earlier one. */
  presetRequestId?: string;
  onClose: () => void;
  onSave: (ret: ReturnRequest) => void;
  /** The status currently being saved, or null when idle — lets only the button that was actually clicked show its loading state, while the rest just get disabled. */
  submittingAction?: ReturnStatus | null;
}

const inputClass = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-300';

export default function ReturnFormModal({ ret, presetRequestId, onClose, onSave, submittingAction }: Props) {
  const submitting = submittingAction != null;
  // Once a return has actually been decided, it's done — re-confirming is a no-op
  // (guarded server-side) but Reject would flip the record to 'discarded' without
  // reversing stock that's already been added, leaving them out of sync. Terminal
  // returns are read-only here; edit/confirm/reject cease to be legitimate.
  const isTerminal = !!ret && (ret.status === 'restocked' || ret.status === 'discarded');
  const { formatAmount } = useCurrency();
  const { isAdmin } = useAuth();
  const [form, setForm] = useState({
    returnedBy: ret?.returnedBy ?? '',
    // No Reason field in the UI anymore — per-item Condition (Good/Damaged) already
    // captures what matters for stock. Kept in state only to satisfy the DB's
    // required, constrained `reason` column without a schema change.
    reason: ret?.reason ?? 'other' as ReturnReason,
    reasonNote: ret?.reasonNote ?? '',
    warehouse: ret?.warehouse ?? '',
    assignedTo: ret?.assignedTo ?? '',
    inspectionNotes: ret?.inspectionNotes ?? '',
    completedAt: ret?.completedAt ?? '',
    items: ret?.items ?? [] as ReturnItem[],
    requestId: ret?.requestId ?? null as string | null,
  });
  const [error, setError] = useState('');
  const [requests, setRequests] = useState<RequestOption[]>([]);
  const [itemLimits, setItemLimits] = useState<Record<string, number>>({});
  const [productPrices, setProductPrices] = useState<Record<string, number>>({});

  useEffect(() => {
    const fetchProductPrices = async () => {
      const { data, error: fetchError } = await supabase.from('products').select('id, price');
      if (!fetchError && data) setProductPrices(Object.fromEntries(data.map((p) => [p.id, p.price as number])));
    };
    const fetchRequests = async () => {
      const { data, error: fetchError } = await supabase.from('stock_requests').select('id, requested_by, warehouse, status, items').eq('needs_return', true);
      if (fetchError || !data) return;

      // A request can receive several partial returns over time — exclude this
      // return's own already-saved items (when editing) so their quantity still
      // counts as "available" rather than being claimed against itself.
      const claimedByRequest = await Promise.all(data.map((r) => getClaimedReturnQuantities(r.id, ret?.id)));

      setRequests(data.map((r, idx) => {
        const claimed = claimedByRequest[idx];
        const items: RequestOptionItem[] = (r.items || []).map((i: { productId: string; productName: string; sku: string; quantity: number; imageUrl?: string | null }) => {
          const alreadyClaimed = claimed[i.productId] || 0;
          return {
            productId: i.productId,
            productName: i.productName,
            sku: i.sku,
            imageUrl: i.imageUrl,
            originalQty: i.quantity,
            alreadyClaimed,
            remaining: Math.max(0, i.quantity - alreadyClaimed),
          };
        });
        return { id: r.id, requestedBy: r.requested_by, warehouse: r.warehouse, status: r.status, items };
      }));
    };
    fetchProductPrices();
    fetchRequests();
  }, [ret?.id]);

  // Keep the per-item cap in sync once request/claim data loads — covers both
  // a fresh pick (pickRequest sets it immediately) and opening this modal to
  // edit an existing request-linked return (no pick action fires).
  useEffect(() => {
    if (!form.requestId) return;
    const request = requests.find((r) => r.id === form.requestId);
    if (request) setItemLimits(Object.fromEntries(request.items.map((i) => [i.productId, i.remaining])));
  }, [requests, form.requestId]);

  const pickRequest = useCallback((requestId: string) => {
    if (!requestId) {
      setForm((prev) => ({ ...prev, requestId: null, items: [] }));
      setItemLimits({});
      return;
    }
    const request = requests.find((r) => r.id === requestId);
    if (!request) return;

    // Only the units not already claimed by an earlier return on this request
    // are offered here — that's what makes repeated partial returns work.
    const returnableItems = request.items.filter((i) => i.remaining > 0);
    const items: ReturnItem[] = returnableItems.map((i) => ({
      productId: i.productId,
      productName: i.productName,
      sku: i.sku,
      imageUrl: i.imageUrl,
      quantity: i.remaining,
      unitPrice: productPrices[i.productId] || 0,
    }));
    setItemLimits(Object.fromEntries(request.items.map((i) => [i.productId, i.remaining])));

    setForm((prev) => ({
      ...prev,
      requestId: request.id,
      returnedBy: request.requestedBy,
      warehouse: request.warehouse,
      items,
    }));
  }, [requests, productPrices]);

  // Jump straight to the request when opened as a "return the rest" follow-up
  // from a completed return, instead of making them pick it again.
  useEffect(() => {
    if (!ret && presetRequestId && !form.requestId && requests.length > 0) {
      pickRequest(presetRequestId);
    }
  }, [requests, presetRequestId, ret, form.requestId, pickRequest]);

  const pickedRequest = requests.find((r) => r.id === form.requestId) || null;

  const totalItems = useMemo(() => form.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0), [form.items]);
  const totalValue = useMemo(() => form.items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0), 0), [form.items]);

  const isChecked = (productId: string) => form.items.some((i) => i.productId === productId);

  const toggleItem = (reqItem: RequestOptionItem) => {
    if (reqItem.remaining === 0) return;
    setForm((prev) => {
      const exists = prev.items.some((i) => i.productId === reqItem.productId);
      if (exists) {
        return { ...prev, items: prev.items.filter((i) => i.productId !== reqItem.productId) };
      }
      const newItem: ReturnItem = {
        productId: reqItem.productId,
        productName: reqItem.productName,
        sku: reqItem.sku,
        imageUrl: reqItem.imageUrl,
        quantity: reqItem.remaining,
        unitPrice: productPrices[reqItem.productId] || 0,
      };
      return { ...prev, items: [...prev.items, newItem] };
    });
  };

  const updateItemQty = (productId: string, quantity: number) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((i) => (i.productId === productId ? { ...i, quantity } : i)),
    }));
  };

  const updateItemPrice = (productId: string, unitPrice: number) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((i) => (i.productId === productId ? { ...i, unitPrice } : i)),
    }));
  };

  // Good/New/Fair go straight back to available stock; Damaged/Defective are still
  // counted in stock but placed on hold — see restockReturnedItems in stockDeduction.ts.
  const setItemGood = (productId: string, good: boolean) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((i) => (i.productId === productId ? { ...i, condition: good ? 'good' : 'damaged' } : i)),
    }));
  };

  const handleFinalize = (status: ReturnStatus) => {
    if (!form.requestId) {
      setError('Select the stock request this return is for.');
      return;
    }

    if (form.items.length === 0 || form.items.some((item) => !item.productName.trim() || !item.sku.trim() || item.quantity < 1)) {
      setError('Select at least one product to return.');
      return;
    }

    const overLimit = form.items.find((item) => {
      const limit = itemLimits[item.productId];
      return limit !== undefined && item.quantity > limit;
    });
    if (overLimit) {
      setError(`${overLimit.productName}: only ${itemLimits[overLimit.productId]} unit(s) remain available to return.`);
      return;
    }

    // Confirming decides real stock right away — every item needs a Good/Not Good
    // call first so there's no ambiguity about which pile it lands in.
    if (status === 'restocked' && form.items.some((item) => !item.condition)) {
      setError('Mark every item Good or Not Good before confirming.');
      return;
    }

    setError('');
    const now = new Date().toLocaleString('sv').replace('T', ' ').slice(0, 16);
    const completedAt = ['restocked', 'discarded'].includes(status)
      ? form.completedAt || ret?.completedAt || now
      : undefined;

    onSave({
      id: ret?.id || '',
      returnedBy: form.returnedBy.trim(),
      status,
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
      warehouse: form.warehouse,
      assignedTo: form.assignedTo.trim() || undefined,
      inspectionNotes: form.inspectionNotes.trim() || undefined,
      requestId: form.requestId,
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
            <p className="text-xs text-gray-400 mt-0.5">{ret ? ret.id : 'Return stock a staff member requested back to inventory'}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 cursor-pointer">
            <i className="ri-close-line text-lg"></i>
          </button>
        </div>

        <form onSubmit={(e) => e.preventDefault()} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <section className="rounded-2xl border border-emerald-100 bg-emerald-50/30 p-4 space-y-2">
            <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">Stock Request</p>
            <select
              value={form.requestId ?? ''}
              onChange={(e) => pickRequest(e.target.value)}
              disabled={!!ret}
              className={`${inputClass} bg-white ${ret ? 'bg-gray-50 text-gray-500' : ''}`}
            >
              <option value="">Select the request this stock was borrowed against…</option>
              {requests.map((r) => {
                const totalOriginal = r.items.reduce((s, i) => s + i.originalQty, 0);
                const totalRemaining = r.items.reduce((s, i) => s + i.remaining, 0);
                const fullyClaimed = totalRemaining === 0 && r.id !== form.requestId;
                return (
                  <option key={r.id} value={r.id} disabled={fullyClaimed}>
                    {r.id} — {r.requestedBy} ({r.warehouse}) — {totalRemaining}/{totalOriginal} units left to return
                    {fullyClaimed ? ' — Fully Claimed' : ''}
                  </option>
                );
              })}
            </select>
            {form.requestId && (() => {
              const request = requests.find((r) => r.id === form.requestId);
              const alreadyClaimed = request?.items.reduce((s, i) => s + i.alreadyClaimed, 0) ?? 0;
              return (
                <p className="text-xs text-emerald-700">
                  <i className="ri-checkbox-circle-line mr-1"></i>
                  Linked — items, requester, and warehouse were auto-filled from {form.requestId}.
                  {alreadyClaimed > 0 && ` ${alreadyClaimed} unit(s) were already covered by earlier returns and are excluded below.`}
                  {' '}Only add the products being returned now — create another return later for whatever's left. The request closes out once every unit has been returned.
                </p>
              );
            })()}
          </section>

          <section className="space-y-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Return details</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Returned By</label>
                <input value={form.returnedBy} disabled className={`${inputClass} bg-gray-50 text-gray-500`} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Warehouse</label>
                <input value={form.warehouse} disabled className={`${inputClass} bg-gray-50 text-gray-500`} />
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Requested products</p>
              {pickedRequest && (
                <span className="text-xs text-gray-400">
                  {pickedRequest.items.length} product{pickedRequest.items.length !== 1 ? 's' : ''} in this request
                </span>
              )}
            </div>
            {!pickedRequest ? (
              <p className="text-sm text-gray-400 py-4 text-center">Select a stock request above to see its products.</p>
            ) : (
              <div className="space-y-2">
                {pickedRequest.items.map((reqItem) => {
                  const checked = isChecked(reqItem.productId);
                  const formItem = form.items.find((i) => i.productId === reqItem.productId);
                  const fullyReturned = reqItem.remaining === 0;
                  return (
                    <div
                      key={reqItem.productId}
                      className={`rounded-xl border px-3 py-2.5 ${fullyReturned ? 'bg-gray-50 border-gray-100' : checked ? 'border-emerald-200 bg-emerald-50/20' : 'border-gray-100'}`}
                    >
                      <label className={`flex items-center gap-3 ${fullyReturned || isTerminal ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={fullyReturned || isTerminal}
                          onChange={() => toggleItem(reqItem)}
                          className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-400 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                        />
                        <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0 overflow-hidden">
                          {reqItem.imageUrl ? (
                            <img src={reqItem.imageUrl} alt={reqItem.productName} className="w-full h-full object-cover" />
                          ) : (
                            <i className="ri-box-3-line text-emerald-500 text-xs"></i>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm font-medium truncate ${fullyReturned ? 'text-gray-400' : 'text-gray-800'}`}>{reqItem.productName}</p>
                          <p className="text-xs text-gray-400 font-mono">{reqItem.sku}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs text-gray-500">Requested <span className="font-semibold text-gray-700">{reqItem.originalQty}</span></p>
                          {fullyReturned ? (
                            <p className="text-[11px] text-emerald-600 font-medium mt-0.5"><i className="ri-checkbox-circle-fill mr-0.5"></i>Fully returned</p>
                          ) : (
                            <p className="text-[11px] text-amber-600 mt-0.5">{reqItem.remaining} left to return</p>
                          )}
                        </div>
                      </label>
                      {checked && formItem && (
                        <div className="flex items-center gap-3 mt-2.5 pl-7">
                          <div className="w-32">
                            <label className="block text-[10px] font-medium text-gray-500 mb-1">Qty to return</label>
                            <input
                              type="number"
                              min={1}
                              max={reqItem.remaining}
                              value={formItem.quantity === 0 ? '' : formItem.quantity}
                              disabled={isTerminal}
                              onChange={(e) => {
                                // Don't clamp while typing — backspacing to retype a smaller
                                // number would otherwise get forced back to 1 on every keystroke.
                                // Clamp for real on blur/submit instead.
                                const val = e.target.value;
                                updateItemQty(reqItem.productId, val === '' ? 0 : Math.max(0, Number(val) || 0));
                              }}
                              onBlur={(e) => {
                                const clamped = Math.min(Math.max(1, Number(e.target.value) || 1), reqItem.remaining);
                                updateItemQty(reqItem.productId, clamped);
                              }}
                              className={`${inputClass} disabled:opacity-60 disabled:cursor-not-allowed`}
                            />
                          </div>
                          <div className="w-32">
                            <label className="block text-[10px] font-medium text-gray-500 mb-1">Unit Value</label>
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={formItem.unitPrice}
                              disabled={isTerminal}
                              onChange={(e) => updateItemPrice(reqItem.productId, Math.max(0, Number(e.target.value) || 0))}
                              className={`${inputClass} disabled:opacity-60 disabled:cursor-not-allowed`}
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-medium text-gray-500 mb-1">Condition</label>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => setItemGood(reqItem.productId, true)}
                                disabled={isTerminal}
                                className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-all disabled:cursor-not-allowed ${isTerminal ? '' : 'cursor-pointer'} ${formItem.condition === 'good' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}
                              >
                                ✅ Good
                              </button>
                              <button
                                type="button"
                                onClick={() => setItemGood(reqItem.productId, false)}
                                disabled={isTerminal}
                                className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-all disabled:cursor-not-allowed ${isTerminal ? '' : 'cursor-pointer'} ${formItem.condition === 'damaged' ? 'bg-orange-50 text-orange-700 border-orange-200' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}
                              >
                                ❌ Damaged
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                      {checked && formItem && formItem.condition && (
                        <div className="mt-1.5 pl-7">
                          <p className="text-[10px] font-medium text-gray-500 mb-1">Stock Status</p>
                          {formItem.condition === 'good' ? (
                            <p className="text-xs text-emerald-700">🟢 Available (can be sold/used)</p>
                          ) : (
                            <p className="text-xs text-amber-700">🟡 On Hold (cannot be sold/used)</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <div className="mt-4 flex items-center justify-end gap-5 text-sm">
              <span className="text-gray-500">Selected: <span className="font-semibold text-gray-800">{totalItems}</span></span>
              <span className="text-gray-500">Stock Value: <span className="font-bold text-gray-900">{formatAmount(totalValue)}</span></span>
            </div>
          </section>

          <section>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Inspection Notes</label>
            <textarea value={form.inspectionNotes} onChange={(e) => setForm((prev) => ({ ...prev, inspectionNotes: e.target.value }))} rows={3} disabled={isTerminal} placeholder="Condition of the returned stock, or any remarks" className={`${inputClass} resize-none disabled:opacity-60 disabled:cursor-not-allowed`} />
          </section>

          {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-3">{error}</div>}
        </form>

        <div className="px-6 py-4 border-t border-gray-100 shrink-0 flex items-center justify-between">
          <p className="text-xs text-gray-400">
            {isTerminal
              ? 'This return has already been decided — read-only.'
              : !ret
              ? 'Create the return first — an admin decides Confirm or Reject afterward.'
              : isAdmin
              ? 'Confirm applies the Good/Not Good decision to stock right away. Reject leaves stock untouched.'
              : 'Saved for an admin to confirm or reject.'}
          </p>
          <div className="flex items-center gap-3">
            <button type="button" onClick={onClose} disabled={submitting} className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer">
              {isTerminal ? 'Close' : 'Cancel'}
            </button>
            {isTerminal ? null : !ret ? (
              <button
                type="button"
                onClick={() => handleFinalize('pending')}
                disabled={submitting}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
              >
                {submittingAction === 'pending' && <i className="ri-loader-4-line animate-spin"></i>}
                {submittingAction === 'pending' ? 'Creating…' : 'Create Return'}
              </button>
            ) : isAdmin ? (
              <>
                <button
                  type="button"
                  onClick={() => handleFinalize('discarded')}
                  disabled={submitting}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-red-500 rounded-lg hover:bg-red-600 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
                >
                  {submittingAction === 'discarded' ? <i className="ri-loader-4-line animate-spin"></i> : <i className="ri-close-circle-line"></i>}
                  {submittingAction === 'discarded' ? 'Rejecting…' : 'Reject'}
                </button>
                <button
                  type="button"
                  onClick={() => handleFinalize('restocked')}
                  disabled={submitting}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
                >
                  {submittingAction === 'restocked' ? <i className="ri-loader-4-line animate-spin"></i> : <i className="ri-checkbox-circle-line"></i>}
                  {submittingAction === 'restocked' ? 'Confirming…' : 'Confirm'}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => handleFinalize('pending')}
                disabled={submitting}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
              >
                {submittingAction === 'pending' && <i className="ri-loader-4-line animate-spin"></i>}
                {submittingAction === 'pending' ? 'Saving…' : 'Save Changes'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
