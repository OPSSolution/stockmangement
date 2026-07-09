import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import DashboardLayout from '@/components/feature/DashboardLayout';
import { type PurchaseOrder, type PurchaseStatus } from '@/mocks/purchases';
import PurchaseStatusBadge from './components/PurchaseStatusBadge';
import PurchaseDetailModal from './components/PurchaseDetailModal';
import PurchaseFormModal from './components/PurchaseFormModal';
import { supabase } from '@/lib/supabase';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useAuth } from '@/contexts/AuthContext';

type FilterTab = 'all' | PurchaseStatus;

const tabs: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'approved', label: 'Approved' },
  { key: 'ordered', label: 'Ordered' },
  { key: 'received', label: 'Received' },
  { key: 'cancelled', label: 'Cancelled' },
];

function mapPurchase(row: Record<string, unknown>): PurchaseOrder {
  return {
    id: row.id as string,
    vendor: row.vendor as string,
    vendorContact: row.vendor_contact as string,
    vendorEmail: row.vendor_email as string,
    warehouse: row.warehouse as 'BM Warehouse' | 'Vendor Warehouse',
    status: row.status as PurchaseStatus,
    items: (row.items as unknown as PurchaseOrder['items']) || [],
    totalItems: row.total_items as number,
    subtotal: row.subtotal as number,
    tax: row.tax as number,
    total: row.total as number,
    requestedBy: row.requested_by as string,
    approvedBy: row.approved_by as string | undefined,
    notes: row.notes as string | undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    expectedDelivery: row.expected_delivery as string | undefined,
    receivedAt: row.received_at as string | undefined,
  };
}

export default function PurchasesPage() {
  const { formatAmount } = useCurrency();
  const { warehouseScope } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [search, setSearch] = useState('');
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    fetchPurchases();
  }, [warehouseScope]);

  useEffect(() => {
    if (searchParams.get('action') === 'new') {
      setShowForm(true);
      searchParams.delete('action');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const fetchPurchases = async () => {
    setLoading(true);
    let query = supabase.from('purchases').select('*').order('created_at', { ascending: false });
    if (warehouseScope) query = query.eq('warehouse', warehouseScope);
    const { data, error } = await query;
    if (error) {
      console.error(error);
    } else {
      setPos((data || []).map(mapPurchase));
    }
    setLoading(false);
  };

  const filtered = useMemo(() => {
    return pos.filter((p) => {
      const matchTab = activeTab === 'all' || p.status === activeTab;
      const q = search.toLowerCase();
      const matchSearch =
        !q ||
        p.id.toLowerCase().includes(q) ||
        p.vendor.toLowerCase().includes(q) ||
        p.items.some((i) => i.productName.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q));
      return matchTab && matchSearch;
    });
  }, [pos, activeTab, search]);

  const kpi = useMemo(() => ({
    submitted: pos.filter((p) => p.status === 'submitted').length,
    approved: pos.filter((p) => p.status === 'approved').length,
    ordered: pos.filter((p) => p.status === 'ordered').length,
    received: pos.filter((p) => p.status === 'received').length,
    totalValue: pos.filter((p) => p.status !== 'cancelled').reduce((s, p) => s + p.total, 0),
    pendingValue: pos.filter((p) => ['submitted', 'approved', 'ordered'].includes(p.status)).reduce((s, p) => s + p.total, 0),
  }), [pos]);

  const handleStatusChange = async (
    id: string,
    status: PurchaseStatus,
    receiptData?: { receivedQty: Record<string, number> }
  ) => {
    const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const updateData: Record<string, unknown> = { status, updated_at: now };
    if (status === 'approved') updateData.approved_by = 'Admin';
    if (status === 'received') updateData.received_at = now;

    if (receiptData) {
      const current = pos.find((p) => p.id === id);
      if (current) {
        updateData.items = current.items.map((item) => ({
          ...item,
          receivedQty: receiptData.receivedQty[item.productId] ?? item.receivedQty,
        }));
      }
    }

    const { error } = await supabase.from('purchases').update(updateData).eq('id', id);
    if (error) {
      console.error(error);
    } else {
      const label: Record<string, string> = {
        approved: 'PO approved!',
        ordered: 'Marked as Ordered — awaiting delivery.',
        received: 'Stock received! Inventory updated.',
        cancelled: 'Purchase order cancelled.',
      };
      setSuccessMsg(label[status] ?? 'Status updated.');
      setTimeout(() => setSuccessMsg(''), 3000);
      await fetchPurchases();
      if (selectedPO?.id === id) {
        const refreshed = (await supabase.from('purchases').select('*').eq('id', id).single()).data;
        if (refreshed) setSelectedPO(mapPurchase(refreshed));
      }
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleFormSubmit = async (data: any) => {
    const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const subtotal = data.items.reduce((s: number, i: { orderedQty: number; unitCost: number }) => s + i.orderedQty * i.unitCost, 0);
    const tax = subtotal * 0.06;
    const maxNum = pos.length > 0 ? Math.max(...pos.map(p => parseInt(p.id.replace('PO-', '')) || 0)) : 0;
    const newId = `PO-${String(maxNum + 1).padStart(4, '0')}`;

    const { error } = await supabase.from('purchases').insert({
      id: newId,
      vendor: data.vendor,
      vendor_contact: data.vendorContact,
      vendor_email: data.vendorEmail,
      warehouse: data.warehouse,
      status: 'submitted',
      items: data.items,
      total_items: data.items.reduce((s: number, i: { orderedQty: number }) => s + i.orderedQty, 0),
      subtotal,
      tax,
      total: subtotal + tax,
      requested_by: 'Admin',
      notes: data.notes || null,
      expected_delivery: data.expectedDelivery || null,
      created_at: now,
      updated_at: now,
    });

    if (error) {
      console.error(error);
      setSuccessMsg('Failed to create purchase order.');
    } else {
      setShowForm(false);
      setSuccessMsg('Purchase order submitted!');
      await fetchPurchases();
    }
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  const tabCount = (key: FilterTab) => key === 'all' ? pos.length : pos.filter((p) => p.status === key).length;

  return (
    <DashboardLayout title="Purchase Orders" subtitle="Manage vendor purchase orders and approval workflow">
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
          <span className="text-sm">Loading purchase orders...</span>
        </div>
      )}

      {!loading && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-6">
            {[
              { label: 'Submitted', value: kpi.submitted, icon: 'ri-send-plane-line', color: 'text-amber-600', bg: 'bg-amber-50', click: 'submitted' as FilterTab },
              { label: 'Approved', value: kpi.approved, icon: 'ri-checkbox-circle-line', color: 'text-sky-600', bg: 'bg-sky-50', click: 'approved' as FilterTab },
              { label: 'Ordered', value: kpi.ordered, icon: 'ri-shopping-cart-2-line', color: 'text-violet-600', bg: 'bg-violet-50', click: 'ordered' as FilterTab },
              { label: 'Received', value: kpi.received, icon: 'ri-check-double-line', color: 'text-emerald-600', bg: 'bg-emerald-50', click: 'received' as FilterTab },
              { label: 'Total PO Value', value: formatAmount(kpi.totalValue), icon: 'ri-money-dollar-circle-line', color: 'text-gray-600', bg: 'bg-gray-100', click: 'all' as FilterTab },
              { label: 'Pending Value', value: formatAmount(kpi.pendingValue), icon: 'ri-time-line', color: 'text-orange-600', bg: 'bg-orange-50', click: 'all' as FilterTab },
            ].map((card) => (
              <button
                key={card.label}
                onClick={() => setActiveTab(card.click)}
                className={`bg-white rounded-xl p-4 text-left border transition-all cursor-pointer ${activeTab === card.click && card.click !== 'all' ? 'border-emerald-300 ring-2 ring-emerald-100' : 'border-gray-100 hover:border-gray-200'}`}
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
              <div className="flex items-center gap-2 bg-gray-50 rounded-lg p-1 flex-wrap">
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
                    placeholder="Search PO, vendor, product…"
                    className="pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 w-56 placeholder-gray-400"
                  />
                </div>
                <button
                  onClick={() => setShowForm(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white text-sm font-semibold rounded-lg hover:bg-emerald-600 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <i className="ri-add-line"></i>New PO
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">PO ID</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Vendor</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Products</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Warehouse</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Units</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Total</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Created</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-5 py-12 text-center text-sm text-gray-400">
                        <i className="ri-shopping-cart-2-line text-3xl block mb-2"></i>
                        No purchase orders found
                      </td>
                    </tr>
                  ) : (
                    filtered.map((po) => (
                      <tr key={po.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-5 py-3.5">
                          <span className="font-mono font-semibold text-gray-900 text-sm">{po.id}</span>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center">
                              <i className="ri-store-2-line text-emerald-600 text-xs"></i>
                            </div>
                            <span className="font-medium text-gray-800 text-sm">{po.vendor}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0 overflow-hidden">
                              {po.items[0].imageUrl ? (
                                <img src={po.items[0].imageUrl} alt={po.items[0].productName} className="w-full h-full object-cover" />
                              ) : (
                                <i className="ri-box-3-line text-emerald-500 text-xs"></i>
                              )}
                            </div>
                            <div>
                              <p className="text-gray-700 text-sm">{po.items[0].productName}</p>
                              {po.items.length > 1 && <p className="text-xs text-gray-400">+{po.items.length - 1} more</p>}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded ${po.warehouse === 'BM Warehouse' ? 'bg-sky-50 text-sky-700' : 'bg-violet-50 text-violet-700'}`}>
                            {po.warehouse === 'BM Warehouse' ? 'BM' : 'Vendor'}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-center font-semibold text-gray-800">{po.totalItems}</td>
                        <td className="px-4 py-3.5 text-right font-semibold text-gray-900">
                          {formatAmount(po.total)}
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <PurchaseStatusBadge status={po.status} />
                        </td>
                        <td className="px-4 py-3.5 text-gray-500 text-xs">{po.createdAt.split(' ')[0]}</td>
                        <td className="px-4 py-3.5 text-center">
                          <button
                            onClick={() => setSelectedPO(po)}
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
              Showing {filtered.length} of {pos.length} purchase orders
            </div>
          </div>
        </>
      )}

      {selectedPO && (
        <PurchaseDetailModal
          po={selectedPO}
          onClose={() => setSelectedPO(null)}
          onStatusChange={handleStatusChange}
        />
      )}
      {showForm && (
        <PurchaseFormModal
          onClose={() => setShowForm(false)}
          onSubmit={handleFormSubmit}
        />
      )}
    </DashboardLayout>
  );
}