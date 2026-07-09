import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import DashboardLayout from '@/components/feature/DashboardLayout';
import { type StockTransfer, type TransferStatus } from '@/mocks/transfers';
import TransferStatusBadge from './components/TransferStatusBadge';
import TransferDetailModal from './components/TransferDetailModal';
import TransferFormModal from './components/TransferFormModal';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

type FilterTab = 'all' | TransferStatus;

const tabs: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'requested', label: 'Requested' },
  { key: 'approved', label: 'Approved' },
  { key: 'in_transit', label: 'In Transit' },
  { key: 'received', label: 'Received' },
  { key: 'cancelled', label: 'Cancelled' },
];

function deriveStatus(stock: number, threshold: number): 'in_stock' | 'low_stock' | 'out_of_stock' {
  if (stock === 0) return 'out_of_stock';
  if (stock <= threshold) return 'low_stock';
  return 'in_stock';
}

// Moves stock from the source warehouse's product into the destination warehouse's
// matching product (matched by SKU) — creating it there if it doesn't exist yet —
// and logs both sides to stock_history so it shows up in each product's history.
async function fulfillTransfer(transfer: StockTransfer): Promise<{ error: string | null }> {
  const now = new Date().toISOString().slice(0, 16).replace('T', ' ');

  const { data: allProducts, error: fetchErr } = await supabase.from('products').select('*');
  if (fetchErr || !allProducts) return { error: fetchErr?.message || 'Failed to load products' };

  let maxNum = allProducts.length > 0
    ? Math.max(...allProducts.map((p) => parseInt(String(p.id).replace('P', '')) || 0))
    : 0;

  for (const item of transfer.items) {
    const sourceProduct = allProducts.find((p) => p.id === item.productId);
    if (!sourceProduct) continue;

    const newSourceStock = Math.max(0, sourceProduct.stock - item.quantity);
    const { error: srcErr } = await supabase.from('products').update({
      stock: newSourceStock,
      status: deriveStatus(newSourceStock, sourceProduct.low_stock_threshold),
      last_updated: now,
    }).eq('id', sourceProduct.id);
    if (srcErr) return { error: srcErr.message };

    await supabase.from('stock_history').insert({
      id: `SH-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      product_id: sourceProduct.id,
      type: 'transfer_out',
      quantity: -item.quantity,
      stock_before: sourceProduct.stock,
      stock_after: newSourceStock,
      reference: transfer.id,
      note: `Transferred to ${transfer.toWarehouse}`,
      warehouse: sourceProduct.warehouse,
      user_name: 'Admin',
      created_at: now,
    });
    sourceProduct.stock = newSourceStock;

    const destProduct = allProducts.find((p) => p.warehouse === transfer.toWarehouse && p.sku === sourceProduct.sku);

    if (destProduct) {
      const newDestStock = destProduct.stock + item.quantity;
      const { error: destErr } = await supabase.from('products').update({
        stock: newDestStock,
        status: deriveStatus(newDestStock, destProduct.low_stock_threshold),
        last_updated: now,
      }).eq('id', destProduct.id);
      if (destErr) return { error: destErr.message };

      await supabase.from('stock_history').insert({
        id: `SH-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        product_id: destProduct.id,
        type: 'transfer_in',
        quantity: item.quantity,
        stock_before: destProduct.stock,
        stock_after: newDestStock,
        reference: transfer.id,
        note: `Transferred from ${transfer.fromWarehouse}`,
        warehouse: destProduct.warehouse,
        user_name: 'Admin',
        created_at: now,
      });
      destProduct.stock = newDestStock;
    } else {
      maxNum += 1;
      const newId = `P${String(maxNum).padStart(3, '0')}`;
      const { error: createErr } = await supabase.from('products').insert({
        id: newId,
        name: sourceProduct.name,
        sku: sourceProduct.sku,
        category: sourceProduct.category,
        warehouse: transfer.toWarehouse,
        vendor: sourceProduct.vendor || null,
        image_url: sourceProduct.image_url || null,
        stock: item.quantity,
        low_stock_threshold: sourceProduct.low_stock_threshold,
        price: sourceProduct.price,
        product_type: sourceProduct.product_type,
        status: deriveStatus(item.quantity, sourceProduct.low_stock_threshold),
        last_updated: now,
      });
      if (createErr) return { error: createErr.message };

      await supabase.from('stock_history').insert({
        id: `SH-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        product_id: newId,
        type: 'transfer_in',
        quantity: item.quantity,
        stock_before: 0,
        stock_after: item.quantity,
        reference: transfer.id,
        note: `Transferred from ${transfer.fromWarehouse} — new product added to ${transfer.toWarehouse}`,
        warehouse: transfer.toWarehouse,
        user_name: 'Admin',
        created_at: now,
      });

      allProducts.push({ ...sourceProduct, id: newId, warehouse: transfer.toWarehouse, stock: item.quantity });
    }
  }

  return { error: null };
}

function mapTransfer(row: Record<string, unknown>): StockTransfer {
  return {
    id: row.id as string,
    fromWarehouse: row.from_warehouse as string,
    toWarehouse: row.to_warehouse as string,
    requestedBy: row.requested_by as string,
    approvedBy: row.approved_by as string | undefined,
    status: row.status as TransferStatus,
    items: (row.items as unknown as StockTransfer['items']) || [],
    totalItems: row.total_items as number,
    reason: row.reason as string,
    notes: row.notes as string | undefined,
    expectedArrival: row.expected_arrival as string | undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    completedAt: row.completed_at as string | undefined,
  };
}

export default function TransfersPage() {
  const { warehouseScope, isAdmin } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [transfers, setTransfers] = useState<StockTransfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [search, setSearch] = useState('');
  const [selectedTransfer, setSelectedTransfer] = useState<StockTransfer | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [statusChanging, setStatusChanging] = useState(false);

  useEffect(() => {
    fetchTransfers();
  }, [warehouseScope]);

  useEffect(() => {
    if (searchParams.get('action') === 'new') {
      setShowForm(true);
      searchParams.delete('action');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const fetchTransfers = async () => {
    setLoading(true);
    let query = supabase.from('transfers').select('*').order('created_at', { ascending: false });
    if (warehouseScope) query = query.or(`from_warehouse.eq.${warehouseScope},to_warehouse.eq.${warehouseScope}`);
    const { data, error } = await query;
    if (error) {
      console.error(error);
    } else {
      setTransfers((data || []).map(mapTransfer));
    }
    setLoading(false);
  };

  const filtered = useMemo(() => {
    return transfers.filter((t) => {
      const matchTab = activeTab === 'all' || t.status === activeTab;
      const q = search.toLowerCase();
      const matchSearch =
        !q ||
        t.id.toLowerCase().includes(q) ||
        t.fromWarehouse.toLowerCase().includes(q) ||
        t.toWarehouse.toLowerCase().includes(q) ||
        t.reason.toLowerCase().includes(q) ||
        t.items.some((i) => i.productName.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q));
      return matchTab && matchSearch;
    });
  }, [transfers, activeTab, search]);

  const kpi = useMemo(() => ({
    requested: transfers.filter((t) => t.status === 'requested').length,
    approved: transfers.filter((t) => t.status === 'approved').length,
    in_transit: transfers.filter((t) => t.status === 'in_transit').length,
    received: transfers.filter((t) => t.status === 'received').length,
    totalUnits: transfers.filter((t) => t.status !== 'cancelled').reduce((s, t) => s + t.totalItems, 0),
  }), [transfers]);

  const handleStatusChange = async (id: string, status: TransferStatus) => {
    if (statusChanging) return;
    const transfer = transfers.find((t) => t.id === id);

    if (status === 'approved' || status === 'in_transit' || status === 'received') {
      const isReceivingWarehouse = isAdmin || (transfer && warehouseScope === transfer.toWarehouse);
      const isSendingWarehouse = isAdmin || (transfer && warehouseScope === transfer.fromWarehouse);
      const allowed = status === 'received' ? isReceivingWarehouse : isSendingWarehouse;
      if (!allowed) {
        const warehouse = status === 'received' ? transfer?.toWarehouse : transfer?.fromWarehouse;
        const action = status === 'approved' ? 'approve' : status === 'in_transit' ? 'mark in transit' : 'confirm receipt of';
        window.alert(`Only ${warehouse ?? 'the responsible warehouse'} can ${action} this transfer.`);
        return;
      }
    }

    setStatusChanging(true);
    try {
      if (status === 'received' && transfer) {
        const { error: fulfillError } = await fulfillTransfer(transfer);
        if (fulfillError) {
          window.alert(`Failed to update inventory: ${fulfillError}`);
          return;
        }
      }

      const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
      const updateData: Record<string, unknown> = { status, updated_at: now };
      if (status === 'approved') updateData.approved_by = 'Admin';
      if (status === 'received') updateData.completed_at = now;

      const { error } = await supabase.from('transfers').update(updateData).eq('id', id);
      if (error) {
        console.error(error);
        window.alert(`Failed to update status: ${error.message}`);
      } else {
        const label: Record<string, string> = { approved: 'Transfer approved!', in_transit: 'Marked as In Transit', received: 'Stock received successfully!', cancelled: 'Transfer cancelled.' };
        setSuccessMsg(label[status] ?? 'Status updated.');
        setTimeout(() => setSuccessMsg(''), 3000);

        const patch: Partial<StockTransfer> = { status, updatedAt: now };
        if (status === 'approved') patch.approvedBy = 'Admin';
        if (status === 'received') patch.completedAt = now;

        setTransfers((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
        setSelectedTransfer((prev) => (prev && prev.id === id ? { ...prev, ...patch } : prev));
      }
    } finally {
      setStatusChanging(false);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleFormSubmit = async (data: any) => {
    const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const maxNum = transfers.length > 0 ? Math.max(...transfers.map(t => parseInt(t.id.replace('TRF-', '')) || 0)) : 0;
    const newId = `TRF-${String(maxNum + 1).padStart(4, '0')}`;
    const totalItems = data.items.reduce((s: number, i: { quantity: number }) => s + i.quantity, 0);

    const { error } = await supabase.from('transfers').insert({
      id: newId,
      from_warehouse: data.fromWarehouse,
      to_warehouse: data.toWarehouse,
      requested_by: 'Admin',
      status: 'requested',
      items: data.items,
      total_items: totalItems,
      reason: data.reason,
      notes: data.notes || null,
      expected_arrival: data.expectedArrival || null,
      created_at: now,
      updated_at: now,
    });

    if (error) {
      console.error(error);
      setSuccessMsg('Failed to create transfer.');
    } else {
      setShowForm(false);
      setSuccessMsg('Transfer request submitted!');
      setTransfers((prev) => [{
        id: newId,
        fromWarehouse: data.fromWarehouse,
        toWarehouse: data.toWarehouse,
        requestedBy: 'Admin',
        approvedBy: undefined,
        status: 'requested',
        items: data.items,
        totalItems,
        reason: data.reason,
        notes: data.notes || undefined,
        expectedArrival: data.expectedArrival || undefined,
        createdAt: now,
        updatedAt: now,
        completedAt: undefined,
      }, ...prev]);
    }
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  const tabCount = (key: FilterTab) => key === 'all' ? transfers.length : transfers.filter((t) => t.status === key).length;

  return (
    <DashboardLayout title="Stock Transfers" subtitle="Manage stock movement between BM and Vendor Warehouse">
      {/* Success toast */}
      {successMsg && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-500 text-white px-4 py-3 rounded-lg shadow text-sm font-medium flex items-center gap-2">
          <i className="ri-checkbox-circle-line"></i>{successMsg}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12 text-gray-400">
          <div className="w-8 h-8 flex items-center justify-center mr-3">
            <i className="ri-loader-4-line animate-spin text-xl"></i>
          </div>
          <span className="text-sm">Loading transfers...</span>
        </div>
      )}

      {!loading && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            {[
              { label: 'Requested', value: kpi.requested, icon: 'ri-time-line', color: 'text-amber-600', bg: 'bg-amber-50', click: 'requested' as FilterTab },
              { label: 'Approved', value: kpi.approved, icon: 'ri-checkbox-circle-line', color: 'text-sky-600', bg: 'bg-sky-50', click: 'approved' as FilterTab },
              { label: 'In Transit', value: kpi.in_transit, icon: 'ri-truck-line', color: 'text-violet-600', bg: 'bg-violet-50', click: 'in_transit' as FilterTab },
              { label: 'Received', value: kpi.received, icon: 'ri-check-double-line', color: 'text-emerald-600', bg: 'bg-emerald-50', click: 'received' as FilterTab },
              { label: 'Total Units Moved', value: kpi.totalUnits, icon: 'ri-archive-line', color: 'text-gray-600', bg: 'bg-gray-100', click: 'all' as FilterTab },
            ].map((card) => (
              <button
                key={card.label}
                onClick={() => setActiveTab(card.click)}
                className={`bg-white rounded-xl p-4 text-left border transition-all cursor-pointer ${activeTab === card.click && card.click !== 'all' ? 'border-emerald-300 ring-2 ring-emerald-100' : 'border-gray-100 hover:border-gray-200'}`}
              >
                <div className={`w-9 h-9 ${card.bg} rounded-lg flex items-center justify-center mb-3`}>
                  <i className={`${card.icon} ${card.color}`}></i>
                </div>
                <p className="text-2xl font-bold text-gray-900 tracking-tight">{card.value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{card.label}</p>
              </button>
            ))}
          </div>

          {/* Toolbar */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-4">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-wrap gap-3">
              <div className="flex items-center gap-2 bg-gray-50 rounded-lg p-1">
                {tabs.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${activeTab === tab.key ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    {tab.label}
                    <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${activeTab === tab.key ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-500'}`}>
                      {tabCount(tab.key)}
                    </span>
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search transfers, products…"
                    className="pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 w-56 placeholder-gray-400"
                  />
                </div>
                <button
                  onClick={() => setShowForm(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white text-sm font-semibold rounded-lg hover:bg-emerald-600 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <i className="ri-add-line"></i>New Transfer
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Transfer ID</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Route</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Products</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Units</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Reason</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-5 py-12 text-center text-sm text-gray-400">
                        <i className="ri-swap-box-line text-3xl block mb-2"></i>
                        No transfers found
                      </td>
                    </tr>
                  ) : (
                    filtered.map((t) => (
                      <tr key={t.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-5 py-3.5">
                          <span className="font-mono font-semibold text-gray-900 text-sm">{t.id}</span>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-1.5 text-sm">
                            <span className="text-xs font-medium px-2 py-0.5 rounded bg-sky-50 text-sky-700 whitespace-nowrap">
                              {t.fromWarehouse}
                            </span>
                            <i className="ri-arrow-right-line text-gray-400 flex-shrink-0"></i>
                            <span className="text-xs font-medium px-2 py-0.5 rounded bg-violet-50 text-violet-700 whitespace-nowrap">
                              {t.toWarehouse}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0 overflow-hidden">
                              {t.items[0].imageUrl ? (
                                <img src={t.items[0].imageUrl} alt={t.items[0].productName} className="w-full h-full object-cover" />
                              ) : (
                                <i className="ri-box-3-line text-emerald-500 text-xs"></i>
                              )}
                            </div>
                            <div>
                              <p className="text-gray-700 text-sm">{t.items[0].productName}</p>
                              {t.items.length > 1 && <p className="text-xs text-gray-400">+{t.items.length - 1} more</p>}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <span className="font-semibold text-gray-800">{t.totalItems}</span>
                        </td>
                        <td className="px-4 py-3.5 text-gray-600 text-sm max-w-[160px] truncate">{t.reason}</td>
                        <td className="px-4 py-3.5 text-center">
                          <TransferStatusBadge status={t.status} />
                        </td>
                        <td className="px-4 py-3.5 text-gray-500 text-xs">{t.createdAt.split(' ')[0]}</td>
                        <td className="px-4 py-3.5 text-center">
                          <button
                            onClick={() => setSelectedTransfer(t)}
                            className="text-xs font-medium text-emerald-600 hover:text-emerald-800 hover:underline cursor-pointer whitespace-nowrap"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="px-5 py-3 border-t border-gray-100 text-xs text-gray-400">
              Showing {filtered.length} of {transfers.length} transfers
            </div>
          </div>
        </>
      )}

      {/* Modals */}
      {selectedTransfer && (
        <TransferDetailModal
          transfer={selectedTransfer}
          onClose={() => setSelectedTransfer(null)}
          onStatusChange={handleStatusChange}
          isSendingWarehouse={isAdmin || warehouseScope === selectedTransfer.fromWarehouse}
          isReceivingWarehouse={isAdmin || warehouseScope === selectedTransfer.toWarehouse}
          statusChanging={statusChanging}
        />
      )}
      {showForm && (
        <TransferFormModal
          onClose={() => setShowForm(false)}
          onSubmit={handleFormSubmit}
        />
      )}
    </DashboardLayout>
  );
}