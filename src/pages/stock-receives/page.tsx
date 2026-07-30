import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import DashboardLayout from '@/components/feature/DashboardLayout';
import { type StockReceive, type StockReceiveItem } from '@/mocks/stockReceives';
import StockReceiveFormModal from './components/StockReceiveFormModal';
import StockReceiveDetailModal from './components/StockReceiveDetailModal';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { exportToCsv } from '@/lib/exportCsv';
import { logAudit } from '@/lib/auditLog';
import { receiveStockItems } from '@/lib/stockDeduction';
import { nowStamp } from '@/lib/timestamp';

function mapStockReceive(row: Record<string, unknown>): StockReceive {
  return {
    id: row.id as string,
    warehouse: row.warehouse as string,
    vendor: (row.vendor as string) || undefined,
    reference: (row.reference as string) || undefined,
    notes: (row.notes as string) || undefined,
    items: (row.items as unknown as StockReceiveItem[]) || [],
    totalItems: row.total_items as number,
    receivedBy: row.received_by as string,
    createdAt: row.created_at as string,
  };
}

export default function StockReceivesPage() {
  const { profile, warehouseScope } = useAuth();
  const receiverIdentity = profile?.full_name || profile?.email || 'Unknown';
  const [searchParams, setSearchParams] = useSearchParams();

  const [receives, setReceives] = useState<StockReceive[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterWarehouse, setFilterWarehouse] = useState<'all' | string>('all');
  const [selected, setSelected] = useState<StockReceive | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    fetchAll();
  }, [warehouseScope]);

  useEffect(() => {
    if (searchParams.get('action') === 'new') {
      setShowForm(true);
      searchParams.delete('action');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const showToast = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  const fetchAll = async () => {
    setLoading(true);
    let query = supabase.from('stock_receives').select('*').order('created_at', { ascending: false });
    if (warehouseScope) query = query.in('warehouse', warehouseScope);
    const { data, error } = await query;
    if (error) console.error(error);
    else setReceives((data || []).map(mapStockReceive));
    setLoading(false);
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return receives.filter((r) => {
      const matchWarehouse = filterWarehouse === 'all' || r.warehouse === filterWarehouse;
      const matchSearch = !q || r.id.toLowerCase().includes(q) || (r.vendor ?? '').toLowerCase().includes(q) || (r.items[0]?.productName ?? '').toLowerCase().includes(q);
      return matchWarehouse && matchSearch;
    });
  }, [receives, filterWarehouse, search]);

  const warehouseOptions = useMemo(() => [...new Set(receives.map((r) => r.warehouse))].sort(), [receives]);

  const kpi = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return {
      total: receives.length,
      today: receives.filter((r) => r.createdAt.startsWith(today)).length,
      unitsThisMonth: receives
        .filter((r) => r.createdAt.slice(0, 7) === today.slice(0, 7))
        .reduce((sum, r) => sum + r.totalItems, 0),
    };
  }, [receives]);

  const handleSubmit = async (data: { warehouse: string; vendor: string; reference: string; notes: string; items: StockReceiveItem[] }) => {
    const now = nowStamp();
    const { data: existing } = await supabase.from('stock_receives').select('id');
    const maxNum = (existing || []).reduce((max, row) => Math.max(max, parseInt((row.id as string).replace('RCV-', '')) || 0), 0);
    const newId = `RCV-${String(maxNum + 1).padStart(4, '0')}`;
    const totalItems = data.items.reduce((s, i) => s + i.quantity, 0);

    const { error } = await supabase.from('stock_receives').insert({
      id: newId,
      warehouse: data.warehouse,
      vendor: data.vendor || null,
      reference: data.reference.trim() || null,
      notes: data.notes.trim() || null,
      items: data.items,
      total_items: totalItems,
      received_by: receiverIdentity,
      created_at: now,
    });

    if (error) {
      console.error(error);
      showToast('Failed to log stock receive.');
      return;
    }

    const { error: stockError } = await receiveStockItems(
      data.items.map((i) => ({ productId: i.productId, warehouse: data.warehouse, quantity: i.quantity, binLocation: i.binLocation, expiryDate: i.expiryDate })),
      { reference: newId, userName: receiverIdentity, note: `Stock receive ${newId}${data.vendor ? ` from ${data.vendor}` : ''}` }
    );

    setShowForm(false);
    await fetchAll();
    if (stockError) {
      showToast(`${newId} logged, but inventory update failed: ${stockError}`);
    } else {
      showToast(`${newId} received — inventory updated.`);
    }
    logAudit({ action: 'create', module: 'inventory', description: `Logged stock receive ${newId} (${totalItems} units) at ${data.warehouse}`, referenceId: newId });
  };

  return (
    <DashboardLayout title="Stock Receives" subtitle="Log stock as it physically arrives — multiple products in one go, applied straight to inventory">
      {successMsg && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-500 text-white px-4 py-3 rounded-lg shadow text-sm font-medium flex items-center gap-2">
          <i className="ri-checkbox-circle-line"></i>{successMsg}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Received Today', value: kpi.today, icon: 'ri-inbox-archive-line', color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Units This Month', value: kpi.unitsThisMonth, icon: 'ri-stack-line', color: 'text-sky-600', bg: 'bg-sky-50' },
          { label: 'Total Receives', value: kpi.total, icon: 'ri-file-list-3-line', color: 'text-violet-600', bg: 'bg-violet-50' },
        ].map((card) => (
          <div key={card.label} className="bg-white rounded-xl p-4 border border-gray-100">
            <div className={`w-9 h-9 ${card.bg} rounded-lg flex items-center justify-center mb-3`}>
              <i className={`${card.icon} ${card.color}`}></i>
            </div>
            <p className="text-xl font-bold text-gray-900 tracking-tight">{card.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{card.label}</p>
          </div>
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
              placeholder="Search ID, vendor, product…"
              className="pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 w-56 placeholder-gray-400"
            />
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <select
              value={filterWarehouse}
              onChange={(e) => setFilterWarehouse(e.target.value)}
              className="py-2 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200 cursor-pointer text-gray-600"
            >
              <option value="all">All Warehouses</option>
              {warehouseOptions.map((w) => <option key={w} value={w}>{w}</option>)}
            </select>
            <button
              onClick={() => exportToCsv('stock-receives', filtered, [
                { header: 'ID', value: (r) => r.id },
                { header: 'Warehouse', value: (r) => r.warehouse },
                { header: 'Vendor', value: (r) => r.vendor || '' },
                { header: 'Reference', value: (r) => r.reference || '' },
                { header: 'Total Units', value: (r) => r.totalItems },
                { header: 'Products', value: (r) => r.items.map((i) => `${i.productName} x${i.quantity}`).join('; ') },
                { header: 'Received By', value: (r) => r.receivedBy },
                { header: 'Date', value: (r) => r.createdAt },
              ])}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-50 transition-colors cursor-pointer whitespace-nowrap"
            >
              <i className="ri-download-2-line"></i>Export
            </button>
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white text-sm font-semibold rounded-lg hover:bg-emerald-600 transition-colors cursor-pointer whitespace-nowrap"
            >
              <i className="ri-add-line"></i>New
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">ID</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Products</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Warehouse</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Vendor</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Units</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Received By</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-sm text-gray-400">
                    <i className="ri-loader-4-line animate-spin text-2xl block mb-2"></i>
                    Loading…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-sm text-gray-400">
                    <i className="ri-inbox-archive-line text-3xl block mb-2"></i>
                    Nothing found for this filter
                  </td>
                </tr>
              ) : (
                filtered.map((row) => {
                  const firstItem = row.items[0];
                  const extraCount = Math.max(0, row.items.length - 1);
                  return (
                    <tr key={row.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-3.5">
                        <span className="font-mono font-semibold text-gray-900 text-sm">{row.id}</span>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0 overflow-hidden">
                            {firstItem?.imageUrl ? (
                              <img src={firstItem.imageUrl} alt={firstItem.productName} className="w-full h-full object-cover" />
                            ) : (
                              <i className="ri-box-3-line text-emerald-500 text-xs"></i>
                            )}
                          </div>
                          <div>
                            <p className="text-gray-700 text-sm">{firstItem?.productName ?? '—'}</p>
                            {extraCount > 0 && <p className="text-xs text-gray-400">+{extraCount} more</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-gray-700 text-sm">{row.warehouse}</td>
                      <td className="px-4 py-3.5 text-gray-500 text-sm">{row.vendor || '—'}</td>
                      <td className="px-4 py-3.5 text-center font-semibold text-gray-800">{row.totalItems}</td>
                      <td className="px-4 py-3.5 text-gray-500 text-sm">{row.receivedBy}</td>
                      <td className="px-4 py-3.5 text-gray-500 text-xs">{row.createdAt.split(/[T ]/)[0]}</td>
                      <td className="px-4 py-3.5 text-center">
                        <button
                          onClick={() => setSelected(row)}
                          className="text-xs font-medium text-emerald-600 hover:text-emerald-800 hover:underline cursor-pointer whitespace-nowrap"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 border-t border-gray-100 text-xs text-gray-400">
          Showing {filtered.length} of {receives.length}
        </div>
      </div>

      {selected && (
        <StockReceiveDetailModal receive={selected} onClose={() => setSelected(null)} />
      )}
      {showForm && (
        <StockReceiveFormModal onClose={() => setShowForm(false)} onSubmit={handleSubmit} />
      )}
    </DashboardLayout>
  );
}
