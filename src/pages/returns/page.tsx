import { useState, useMemo, useEffect } from 'react';
import DashboardLayout from '@/components/feature/DashboardLayout';
import { type ReturnRequest, type ReturnStatus } from '@/mocks/returns';
import ReturnStatusBadge from './components/ReturnStatusBadge';
import ReturnDetailModal from './components/ReturnDetailModal';
import ReturnFormModal from './components/ReturnFormModal';
import { supabase } from '@/lib/supabase';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useAuth } from '@/contexts/AuthContext';
import { exportToCsv } from '@/lib/exportCsv';
import { logAudit } from '@/lib/auditLog';
import { getCompletedReturnQuantities } from '@/lib/returnProgress';

type FilterTab = 'all' | ReturnStatus;

const tabs: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'inspecting', label: 'Inspecting' },
  { key: 'approved', label: 'Approved' },
  { key: 'restocked', label: 'Restocked' },
  { key: 'discarded', label: 'Discarded' },
];

const reasonLabels: Record<string, string> = {
  photoshoot: 'Used for Photoshoot/Project',
  excess: 'Excess / Not Used',
  damaged: 'Damaged During Use',
  consignment: 'Borrowed (Consignment)',
  other: 'Other',
};

function mapReturn(row: Record<string, unknown>): ReturnRequest {
  return {
    id: row.id as string,
    returnedBy: row.customer as string,
    status: row.status as ReturnStatus,
    items: (row.items as unknown as ReturnRequest['items']) || [],
    totalItems: row.total_items as number,
    totalValue: row.total_value as number,
    reason: row.reason as ReturnRequest['reason'],
    reasonNote: row.reason_note as string | undefined,
    warehouse: row.warehouse as string,
    assignedTo: row.assigned_to as string | undefined,
    inspectionNotes: row.inspection_notes as string | undefined,
    requestId: row.request_id as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    completedAt: row.completed_at as string | undefined,
  };
}

function toDbReturn(ret: ReturnRequest): Record<string, unknown> {
  return {
    id: ret.id,
    customer: ret.returnedBy,
    status: ret.status,
    items: ret.items,
    total_items: ret.totalItems,
    total_value: ret.totalValue,
    reason: ret.reason,
    reason_note: ret.reasonNote || null,
    warehouse: ret.warehouse,
    assigned_to: ret.assignedTo || null,
    inspection_notes: ret.inspectionNotes || null,
    request_id: ret.requestId,
    created_at: ret.createdAt,
    updated_at: ret.updatedAt,
    completed_at: ret.completedAt || null,
  };
}

export default function ReturnsPage() {
  const { formatAmount } = useCurrency();
  const { canEdit, canDelete, warehouseScope } = useAuth();
  const showEdit = canEdit('returns');
  const showDelete = canDelete('returns');
  const [returns, setReturns] = useState<ReturnRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [search, setSearch] = useState('');
  const [selectedReturn, setSelectedReturn] = useState<ReturnRequest | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editReturn, setEditReturn] = useState<ReturnRequest | null>(null);
  const [deleteReturn, setDeleteReturn] = useState<ReturnRequest | null>(null);
  const [successMsg, setSuccessMsg] = useState('');
  const [presetRequestId, setPresetRequestId] = useState<string | null>(null);

  useEffect(() => {
    fetchReturns();
  }, [warehouseScope]);

  const fetchReturns = async () => {
    setLoading(true);
    let query = supabase.from('returns').select('*').order('created_at', { ascending: false });
    if (warehouseScope) query = query.in('warehouse', warehouseScope);
    const { data, error } = await query;
    if (error) {
      console.error(error);
    } else {
      setReturns((data || []).map(mapReturn));
    }
    setLoading(false);
  };

  const filtered = useMemo(() => {
    return returns.filter((r) => {
      const matchTab = activeTab === 'all' || r.status === activeTab;
      const q = search.toLowerCase();
      const matchSearch =
        !q ||
        r.id.toLowerCase().includes(q) ||
        r.requestId.toLowerCase().includes(q) ||
        r.returnedBy.toLowerCase().includes(q) ||
        r.items.some((i) => i.productName.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q));
      return matchTab && matchSearch;
    });
  }, [returns, activeTab, search]);

  // A request can be covered by several partial returns over time — group them
  // by request (oldest first) so the table shows one row per request instead
  // of one row per return, with the full history available in Return Details.
  const groupsByRequest = useMemo(() => {
    const map: Record<string, ReturnRequest[]> = {};
    returns.forEach((r) => {
      (map[r.requestId] ||= []).push(r);
    });
    Object.values(map).forEach((g) => g.sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
    return map;
  }, [returns]);

  // One table row per request among the filtered results — represented by the
  // most recently submitted matching return.
  const groupedRows = useMemo(() => {
    const latestByRequest = new Map<string, ReturnRequest>();
    filtered.forEach((r) => {
      const existing = latestByRequest.get(r.requestId);
      if (!existing || r.createdAt > existing.createdAt) latestByRequest.set(r.requestId, r);
    });
    return [...latestByRequest.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [filtered]);

  const handleCreateFollowUp = (requestId: string) => {
    setSelectedReturn(null);
    setEditReturn(null);
    setPresetRequestId(requestId);
    setShowForm(true);
  };

  const kpi = useMemo(() => ({
    pending: returns.filter((r) => r.status === 'pending').length,
    inspecting: returns.filter((r) => r.status === 'inspecting').length,
    approved: returns.filter((r) => r.status === 'approved').length,
    restocked: returns.filter((r) => r.status === 'restocked').length,
    discarded: returns.filter((r) => r.status === 'discarded').length,
    totalRestockedValue: returns.filter((r) => r.status === 'restocked').reduce((s, r) => s + r.totalValue, 0),
  }), [returns]);

  const handleUpdate = async (id: string, updates: Partial<ReturnRequest>) => {
    const dbUpdates: Record<string, unknown> = {};
    if (updates.status) dbUpdates.status = updates.status;
    if (updates.items) dbUpdates.items = updates.items;
    if (updates.inspectionNotes !== undefined) dbUpdates.inspection_notes = updates.inspectionNotes;
    if (updates.assignedTo !== undefined) dbUpdates.assigned_to = updates.assignedTo;
    if (updates.updatedAt) dbUpdates.updated_at = updates.updatedAt;
    if (updates.completedAt) dbUpdates.completed_at = updates.completedAt;

    const { error } = await supabase.from('returns').update(dbUpdates).eq('id', id);
    if (error) {
      console.error(error);
    } else {
      const statusMessages: Partial<Record<ReturnStatus, string>> = {
        inspecting: 'Inspection started.',
        approved: 'Return approved!',
        restocked: 'Items restocked to inventory.',
        discarded: 'Items discarded.',
      };
      const newStatus = updates.status;
      if (newStatus && statusMessages[newStatus]) {
        setSuccessMsg(statusMessages[newStatus] ?? 'Updated.');
        setTimeout(() => setSuccessMsg(''), 3000);
      }

      // A request can be closed out by several partial returns over time — only
      // flip it to 'returned' once every requested unit has been resolved by a
      // return that has itself reached a terminal state (restocked or discarded).
      if (newStatus === 'restocked' || newStatus === 'discarded') {
        const requestId = returns.find((r) => r.id === id)?.requestId;
        if (requestId) {
          const { data: reqRow } = await supabase.from('stock_requests').select('items').eq('id', requestId).maybeSingle();
          const requestedItems = (reqRow?.items as { productId: string; quantity: number }[]) || [];
          const completed = await getCompletedReturnQuantities(requestId);
          const fullyReturned = requestedItems.length > 0 && requestedItems.every((i) => (completed[i.productId] || 0) >= i.quantity);

          if (fullyReturned) {
            const { error: reqError } = await supabase.from('stock_requests').update({
              status: 'returned',
              return_reason: `Fully returned via ${id}`,
              updated_at: new Date().toISOString(),
            }).eq('id', requestId);
            if (reqError) console.error('Failed to mark linked request as returned:', reqError);
          }
        }
      }

      await fetchReturns();
      if (selectedReturn?.id === id) {
        const refreshed = (await supabase.from('returns').select('*').eq('id', id).single()).data;
        if (refreshed) setSelectedReturn(mapReturn(refreshed));
      }
      if (newStatus) logAudit({ action: 'update', module: 'returns', description: `Return ${id} ${newStatus}`, referenceId: id });
    }
  };

  const handleSaveReturn = async (ret: ReturnRequest) => {
    const nextId = ret.id || `RET-${String(
      (returns.length > 0 ? Math.max(...returns.map((r) => Number(r.id.replace(/\D/g, '')) || 0)) : 0) + 1
    ).padStart(4, '0')}`;

    const payload = toDbReturn({ ...ret, id: nextId });
    const request = ret.id
      ? supabase.from('returns').update(payload).eq('id', ret.id)
      : supabase.from('returns').insert(payload);

    const { error } = await request;
    if (error) {
      console.error(error);
      setSuccessMsg('Failed to save return.');
    } else {
      setSuccessMsg(ret.id ? 'Return updated.' : 'Return created.');
      setShowForm(false);
      setEditReturn(null);
      setPresetRequestId(null);
      await fetchReturns();
      logAudit({
        action: ret.id ? 'update' : 'create',
        module: 'returns',
        description: ret.id ? `Updated return ${nextId}` : `Created return ${nextId} for request ${ret.requestId}`,
        referenceId: nextId,
      });
    }
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  const handleDeleteReturn = async () => {
    if (!deleteReturn) return;

    const { error } = await supabase.from('returns').delete().eq('id', deleteReturn.id);
    if (error) {
      console.error(error);
      setSuccessMsg('Failed to delete return.');
    } else {
      setSuccessMsg('Return deleted.');
      setDeleteReturn(null);
      await fetchReturns();
      logAudit({ action: 'delete', module: 'returns', description: `Deleted return ${deleteReturn.id}`, referenceId: deleteReturn.id });
    }
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  const tabCount = (key: FilterTab) => key === 'all' ? returns.length : returns.filter((r) => r.status === key).length;

  return (
    <DashboardLayout title="Returns" subtitle="Stock staff have requested and are returning back to inventory">
      {successMsg && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-500 text-white px-4 py-3 rounded-lg shadow text-sm font-medium flex items-center gap-2">
          <i className="ri-checkbox-circle-line"></i>{successMsg}
        </div>
      )}

      <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-6">
            {[
              { label: 'Pending Review', value: kpi.pending, icon: 'ri-time-line', color: 'text-amber-600', bg: 'bg-amber-50', click: 'pending' as FilterTab },
              { label: 'Under Inspection', value: kpi.inspecting, icon: 'ri-search-eye-line', color: 'text-sky-600', bg: 'bg-sky-50', click: 'inspecting' as FilterTab },
              { label: 'Approved', value: kpi.approved, icon: 'ri-checkbox-circle-line', color: 'text-violet-600', bg: 'bg-violet-50', click: 'approved' as FilterTab },
              { label: 'Restocked', value: kpi.restocked, icon: 'ri-archive-stack-line', color: 'text-emerald-600', bg: 'bg-emerald-50', click: 'restocked' as FilterTab },
              { label: 'Discarded', value: kpi.discarded, icon: 'ri-delete-bin-line', color: 'text-red-600', bg: 'bg-red-50', click: 'discarded' as FilterTab },
              { label: 'Restocked Value', value: formatAmount(kpi.totalRestockedValue), icon: 'ri-archive-2-line', color: 'text-teal-600', bg: 'bg-teal-50', click: 'restocked' as FilterTab },
            ].map((card) => (
              <button
                key={card.label}
                onClick={() => setActiveTab(card.click)}
                className={`bg-white rounded-xl p-4 text-left border transition-all cursor-pointer ${activeTab === card.click ? 'border-emerald-300 ring-2 ring-emerald-100' : 'border-gray-100 hover:border-gray-200'}`}
              >
                <div className={`w-9 h-9 ${card.bg} rounded-lg flex items-center justify-center mb-3`}>
                  <i className={`${card.icon} ${card.color}`}></i>
                </div>
                <p className="text-xl font-bold text-gray-900 tracking-tight">{card.value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{card.label}</p>
              </button>
            ))}
          </div>

          {/* Table Card */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-wrap gap-3">
              <div className="relative">
                <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search returns, staff, product…"
                  className="pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 w-60 placeholder-gray-400"
                />
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <select
                  value={activeTab}
                  onChange={(e) => setActiveTab(e.target.value as FilterTab)}
                  className="py-2 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200 cursor-pointer text-gray-600"
                >
                  {tabs.map((tab) => (
                    <option key={tab.key} value={tab.key}>
                      {tab.label} ({tabCount(tab.key)})
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => exportToCsv('returns', filtered, [
                    { header: 'ID', value: (r) => r.id },
                    { header: 'Linked Request', value: (r) => r.requestId },
                    { header: 'Returned By', value: (r) => r.returnedBy },
                    { header: 'Status', value: (r) => r.status },
                    { header: 'Warehouse', value: (r) => r.warehouse },
                    { header: 'Items', value: (r) => r.items.map((i) => `${i.productName} x${i.quantity}`).join('; ') },
                    { header: 'Total Items', value: (r) => r.totalItems },
                    { header: 'Stock Value', value: (r) => r.totalValue },
                    { header: 'Reason', value: (r) => reasonLabels[r.reason] || r.reason },
                    { header: 'Assigned To', value: (r) => r.assignedTo || '' },
                    { header: 'Created At', value: (r) => r.createdAt },
                    { header: 'Updated At', value: (r) => r.updatedAt },
                  ])}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <i className="ri-download-2-line"></i>Export
                </button>
                <button
                  onClick={() => setShowForm(true)}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <i className="ri-add-line"></i>Add Return
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Request</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Returned By</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Product(s)</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Reason</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Stock Value</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Submitted</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {groupedRows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-5 py-12 text-center text-sm text-gray-400">
                        <i className="ri-arrow-go-back-line text-3xl block mb-2"></i>
                        No return requests found
                      </td>
                    </tr>
                  ) : (
                    groupedRows.map((r) => {
                      const group = groupsByRequest[r.requestId] || [r];
                      const groupValue = group.reduce((s, g) => s + g.totalValue, 0);
                      const groupProducts = [...new Map(group.flatMap((g) => g.items).map((i) => [i.productName, i])).values()];
                      return (
                        <tr key={r.requestId} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-5 py-3.5">
                            <span className="font-mono font-semibold text-gray-900 text-sm">{r.requestId}</span>
                            {group.length > 1 && (
                              <p className="text-[10px] font-normal text-gray-400 mt-0.5">{group.length} returns submitted</p>
                            )}
                          </td>
                          <td className="px-4 py-3.5">
                            <p className="font-semibold text-gray-800 text-sm">{r.returnedBy}</p>
                            <p className="text-xs text-gray-400">{r.warehouse}</p>
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0 overflow-hidden">
                                {groupProducts[0].imageUrl ? (
                                  <img src={groupProducts[0].imageUrl} alt={groupProducts[0].productName} className="w-full h-full object-cover" />
                                ) : (
                                  <i className="ri-box-3-line text-emerald-500 text-xs"></i>
                                )}
                              </div>
                              <div>
                                <p className="text-gray-700 text-sm">{groupProducts[0].productName}</p>
                                {groupProducts.length > 1 && <p className="text-xs text-gray-400">+{groupProducts.length - 1} more</p>}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            <span className="text-xs text-gray-600">{reasonLabels[r.reason]}</span>
                          </td>
                          <td className="px-4 py-3.5 text-right font-semibold text-gray-900">
                            {formatAmount(groupValue)}
                          </td>
                          <td className="px-4 py-3.5 text-center">
                            <ReturnStatusBadge status={r.status} />
                          </td>
                          <td className="px-4 py-3.5 text-gray-500 text-xs">{r.createdAt.split(' ')[0]}</td>
                          <td className="px-4 py-3.5 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => setSelectedReturn(r)}
                                className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-emerald-600 hover:bg-emerald-50 cursor-pointer"
                                title={['pending', 'inspecting', 'approved'].includes(r.status) ? 'Process return' : 'View return'}
                              >
                                <i className={['pending', 'inspecting', 'approved'].includes(r.status) ? 'ri-play-circle-line' : 'ri-eye-line'}></i>
                              </button>
                              {group.length === 1 && showEdit && (
                                <button
                                  onClick={() => setEditReturn(r)}
                                  className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 cursor-pointer"
                                  title="Edit return"
                                >
                                  <i className="ri-edit-line"></i>
                                </button>
                              )}
                              {group.length === 1 && showDelete && (
                                <button
                                  onClick={() => setDeleteReturn(r)}
                                  className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 cursor-pointer"
                                  title="Delete return"
                                >
                                  <i className="ri-delete-bin-line"></i>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <div className="px-5 py-3 border-t border-gray-100 text-xs text-gray-400">
              Showing {groupedRows.length} of {Object.keys(groupsByRequest).length} requested returns ({returns.length} return{returns.length !== 1 ? 's' : ''} total)
            </div>
          </div>
        </>

      {selectedReturn && (
        <ReturnDetailModal
          ret={selectedReturn}
          history={groupsByRequest[selectedReturn.requestId]}
          onSelectReturn={setSelectedReturn}
          onClose={() => setSelectedReturn(null)}
          onUpdate={handleUpdate}
          onCreateFollowUp={handleCreateFollowUp}
        />
      )}
      {(showForm || editReturn) && (
        <ReturnFormModal
          ret={editReturn ?? undefined}
          presetRequestId={!editReturn ? presetRequestId ?? undefined : undefined}
          onClose={() => { setShowForm(false); setEditReturn(null); setPresetRequestId(null); }}
          onSave={handleSaveReturn}
        />
      )}
      {deleteReturn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-sm mx-4 shadow-xl p-6">
            <div className="flex flex-col items-center text-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
                <i className="ri-delete-bin-line text-red-500 text-xl"></i>
              </div>
              <div>
                <h2 className="text-base font-bold text-gray-900">Delete Return?</h2>
                <p className="text-sm text-gray-500 mt-1">
                  You are about to delete <span className="font-semibold text-gray-800">{deleteReturn.id}</span>. This action cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setDeleteReturn(null)}
                className="flex-1 py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer whitespace-nowrap"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteReturn}
                className="flex-1 py-2.5 text-sm font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors cursor-pointer whitespace-nowrap"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
