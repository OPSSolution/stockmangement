import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import DashboardLayout from '@/components/feature/DashboardLayout';
import { type PurchaseOrder, type PurchaseStatus } from '@/mocks/purchases';
import PurchaseDetailModal from './components/PurchaseDetailModal';
import PurchaseFormModal from './components/PurchaseFormModal';
import PurchaseStatusBadge from './components/PurchaseStatusBadge';
import { supabase } from '@/lib/supabase';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useAuth } from '@/contexts/AuthContext';
import { exportToCsv } from '@/lib/exportCsv';
import { logAudit } from '@/lib/auditLog';
import { receivePurchaseOrderItems } from '@/lib/stockDeduction';
import { uploadShipmentDocument } from '@/lib/uploadShipmentDocument';
import { nowStamp } from '@/lib/timestamp';

const tabs: { key: 'all' | PurchaseStatus; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending Approval' },
  { key: 'approved', label: 'Approved' },
  { key: 'ordered', label: 'Ordered' },
  { key: 'received', label: 'Complete' },
  { key: 'rejected', label: 'Rejected' },
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
    reason: (row.reason as string) || undefined,
    requestedBy: row.requested_by as string,
    submittedBy: (row.submitted_by as string) || undefined,
    reviewNote: (row.review_note as string) || undefined,
    approvedBy: row.approved_by as string | undefined,
    approvedAt: (row.approved_at as string) || undefined,
    notes: row.notes as string | undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    expectedDelivery: row.expected_delivery as string | undefined,
    receivedAt: row.received_at as string | undefined,
    receiptDocumentUrl: (row.receipt_document_url as string) || null,
    receiptDocumentName: (row.receipt_document_name as string) || null,
  };
}

export default function PurchasesPage() {
  const { formatAmount } = useCurrency();
  const { profile, canApprove, warehouseScope } = useAuth();
  const requesterIdentity = profile?.full_name || profile?.email || 'Unknown';
  const canDecide = canApprove('purchases');
  const [searchParams, setSearchParams] = useSearchParams();

  const [purchases, setPurchases] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | PurchaseStatus>('all');
  const [search, setSearch] = useState('');
  const [filterWarehouse, setFilterWarehouse] = useState<'all' | string>('all');
  const [filterVendor, setFilterVendor] = useState<'all' | string>('all');
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
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
    let query = supabase.from('purchases').select('*').order('created_at', { ascending: false });
    if (warehouseScope) query = query.in('warehouse', warehouseScope);
    const { data, error } = await query;
    if (error) console.error(error);
    else setPurchases((data || []).map(mapPurchase));
    setLoading(false);
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return purchases.filter((p) => {
      const matchTab = activeTab === 'all' || p.status === activeTab;
      const matchWarehouse = filterWarehouse === 'all' || p.warehouse === filterWarehouse;
      const matchVendor = filterVendor === 'all' || p.vendor === filterVendor;
      const matchSearch = !q || p.id.toLowerCase().includes(q) || p.vendor.toLowerCase().includes(q) || (p.items[0]?.productName ?? '').toLowerCase().includes(q);
      return matchTab && matchWarehouse && matchVendor && matchSearch;
    });
  }, [purchases, activeTab, filterWarehouse, filterVendor, search]);

  const tabCount = (key: 'all' | PurchaseStatus) => key === 'all' ? purchases.length : purchases.filter((p) => p.status === key).length;

  const warehouseOptions = useMemo(() => [...new Set(purchases.map((p) => p.warehouse))].sort(), [purchases]);
  const vendorOptions = useMemo(() => [...new Set(purchases.map((p) => p.vendor))].sort(), [purchases]);

  const kpi = useMemo(() => ({
    pending: purchases.filter((p) => p.status === 'pending').length,
    approved: purchases.filter((p) => p.status === 'approved').length,
    ordered: purchases.filter((p) => p.status === 'ordered').length,
    received: purchases.filter((p) => p.status === 'received').length,
    pendingValue: purchases.filter((p) => ['pending', 'approved', 'ordered'].includes(p.status)).reduce((s, p) => s + p.total, 0),
  }), [purchases]);

  const handleSubmit = async (data: {
    vendor: string;
    vendorContact: string;
    vendorEmail: string;
    warehouse: 'BM Warehouse' | 'Vendor Warehouse';
    reason: string;
    notes: string;
    expectedDelivery: string;
    items: PurchaseOrder['items'];
  }) => {
    const now = nowStamp();
    const subtotal = data.items.reduce((s, i) => s + i.orderedQty * i.unitCost, 0);
    const tax = subtotal * 0.06;

    const { data: inserted, error } = await supabase
      .from('purchases')
      .insert({
        vendor: data.vendor,
        vendor_contact: data.vendorContact || null,
        vendor_email: data.vendorEmail || null,
        warehouse: data.warehouse,
        status: 'pending',
        items: data.items,
        total_items: data.items.reduce((s, i) => s + i.orderedQty, 0),
        subtotal,
        tax,
        total: subtotal + tax,
        reason: data.reason.trim() || null,
        requested_by: requesterIdentity,
        submitted_by: requesterIdentity,
        notes: data.notes || null,
        expected_delivery: data.expectedDelivery || null,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (error || !inserted) {
      console.error(error);
      showToast('Failed to submit purchase order.');
      return;
    }

    setShowForm(false);
    showToast(`Purchase order ${inserted.id} submitted for approval.`);
    await fetchAll();
    logAudit({ action: 'create', module: 'purchases', description: `Created purchase order ${inserted.id} for ${data.vendor}`, referenceId: inserted.id as string });
  };

  const handleStatusChange = async (
    id: string,
    status: PurchaseStatus,
    extra?: { receivedQty?: Record<string, number>; receivedBin?: Record<string, string>; documentFile?: File; reviewNote?: string }
  ) => {
    const target = purchases.find((p) => p.id === id);
    const isOwner = !!target && target.submittedBy === requesterIdentity;
    if (status === 'cancelled' ? (!canDecide && !isOwner) : !canDecide) return;
    if (status === 'received' && !extra?.documentFile) return;

    if (extra?.documentFile) setUploadingReceipt(true);
    let documentUrl: string | null = null;
    if (extra?.documentFile) {
      const { url, error: uploadError } = await uploadShipmentDocument(extra.documentFile);
      if (uploadError || !url) {
        setUploadingReceipt(false);
        showToast('Failed to upload delivery document: ' + (uploadError || 'unknown error'));
        return;
      }
      documentUrl = url;
    }

    const now = nowStamp();
    const updateData: Record<string, unknown> = { status, updated_at: now };
    if (status === 'approved') {
      updateData.approved_by = requesterIdentity;
      updateData.approved_at = now;
    }
    if (status === 'rejected') updateData.review_note = extra?.reviewNote || null;
    if (status === 'received') {
      updateData.received_at = now;
      updateData.receipt_document_url = documentUrl;
      updateData.receipt_document_name = extra?.documentFile?.name;
    }

    if (extra?.receivedQty) {
      const current = purchases.find((p) => p.id === id);
      if (current) {
        updateData.items = current.items.map((item) => ({
          ...item,
          receivedQty: extra.receivedQty![item.productId] ?? item.receivedQty,
          binLocation: extra.receivedBin?.[item.productId] ?? item.binLocation,
        }));
      }
    }

    const { error } = await supabase.from('purchases').update(updateData).eq('id', id);
    if (error) {
      console.error(error);
      setUploadingReceipt(false);
      showToast('Failed to update status.');
      return;
    }

    if (status === 'received' && extra?.receivedQty) {
      const current = purchases.find((p) => p.id === id);
      const lines = (current?.items || [])
        .map((item) => ({
          productId: item.productId,
          warehouse: current?.warehouse ?? '',
          quantity: extra.receivedQty![item.productId] ?? 0,
          binLocation: extra.receivedBin?.[item.productId] || undefined,
        }))
        .filter((line) => line.quantity > 0 && line.warehouse);
      const { error: stockError } = await receivePurchaseOrderItems(lines, { reference: id, userName: requesterIdentity });
      setUploadingReceipt(false);
      if (stockError) {
        showToast(`Purchase order ${id} marked received, but inventory update failed: ${stockError}`);
        await fetchAll();
        return;
      }
    }

    const label: Record<string, string> = {
      approved: 'Purchase order approved!',
      rejected: 'Purchase order rejected.',
      ordered: 'Marked as Ordered — awaiting delivery.',
      received: 'Stock received! Inventory updated.',
      cancelled: 'Purchase order cancelled.',
    };
    showToast(label[status] ?? 'Status updated.');
    await fetchAll();
    if (selectedPO?.id === id) {
      const refreshed = (await supabase.from('purchases').select('*').eq('id', id).single()).data;
      setSelectedPO(refreshed ? mapPurchase(refreshed) : null);
    }
    logAudit({ action: 'update', module: 'purchases', description: `Purchase order ${id} ${status}`, referenceId: id });
  };

  return (
    <DashboardLayout title="Purchases" subtitle="Request approval to buy from a vendor, then track it through to delivery — all in one place">
      {successMsg && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-500 text-white px-4 py-3 rounded-lg shadow text-sm font-medium flex items-center gap-2">
          <i className="ri-checkbox-circle-line"></i>{successMsg}
        </div>
      )}

      <>
        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          {[
            { label: 'Pending Approval', value: kpi.pending, icon: 'ri-time-line', color: 'text-amber-600', bg: 'bg-amber-50', click: 'pending' as const },
            { label: 'Approved', value: kpi.approved, icon: 'ri-checkbox-circle-line', color: 'text-sky-600', bg: 'bg-sky-50', click: 'approved' as const },
            { label: 'Ordered', value: kpi.ordered, icon: 'ri-shopping-cart-2-line', color: 'text-violet-600', bg: 'bg-violet-50', click: 'ordered' as const },
            { label: 'Complete', value: kpi.received, icon: 'ri-check-double-line', color: 'text-emerald-600', bg: 'bg-emerald-50', click: 'received' as const },
            { label: 'Pending Value', value: formatAmount(kpi.pendingValue), icon: 'ri-money-dollar-circle-line', color: 'text-orange-600', bg: 'bg-orange-50', click: 'all' as const },
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
                value={activeTab}
                onChange={(e) => setActiveTab(e.target.value as 'all' | PurchaseStatus)}
                className="py-2 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200 cursor-pointer text-gray-600"
              >
                {tabs.map((tab) => (
                  <option key={tab.key} value={tab.key}>{tab.label} ({tabCount(tab.key)})</option>
                ))}
              </select>
              <select
                value={filterWarehouse}
                onChange={(e) => setFilterWarehouse(e.target.value)}
                className="py-2 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200 cursor-pointer text-gray-600"
              >
                <option value="all">All Warehouses</option>
                {warehouseOptions.map((w) => (
                  <option key={w} value={w}>{w}</option>
                ))}
              </select>
              <select
                value={filterVendor}
                onChange={(e) => setFilterVendor(e.target.value)}
                className="py-2 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200 cursor-pointer text-gray-600"
              >
                <option value="all">All Vendors</option>
                {vendorOptions.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
              <button
                onClick={() => exportToCsv('purchases', filtered, [
                  { header: 'ID', value: (r) => r.id },
                  { header: 'Vendor', value: (r) => r.vendor },
                  { header: 'Warehouse', value: (r) => r.warehouse },
                  { header: 'Status', value: (r) => r.status },
                  { header: 'Total Items', value: (r) => r.totalItems },
                  { header: 'Total', value: (r) => r.total },
                  { header: 'Requested By', value: (r) => r.requestedBy },
                  { header: 'Approved By', value: (r) => r.approvedBy || '' },
                  { header: 'Created At', value: (r) => r.createdAt },
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
                {loading ? (
                  <tr>
                    <td colSpan={9} className="px-5 py-12 text-center text-sm text-gray-400">
                      <i className="ri-loader-4-line animate-spin text-2xl block mb-2"></i>
                      Loading…
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-5 py-12 text-center text-sm text-gray-400">
                      <i className="ri-shopping-cart-2-line text-3xl block mb-2"></i>
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
                            <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center">
                              <i className="ri-store-2-line text-emerald-600 text-xs"></i>
                            </div>
                            <span className="font-medium text-gray-800 text-sm">{row.vendor}</span>
                          </div>
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
                        <td className="px-4 py-3.5">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded ${row.warehouse === 'BM Warehouse' ? 'bg-sky-50 text-sky-700' : 'bg-violet-50 text-violet-700'}`}>
                            {row.warehouse === 'BM Warehouse' ? 'BM' : 'Vendor'}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-center font-semibold text-gray-800">{row.totalItems}</td>
                        <td className="px-4 py-3.5 text-right font-semibold text-gray-900">{formatAmount(row.total)}</td>
                        <td className="px-4 py-3.5 text-center">
                          <PurchaseStatusBadge status={row.status} />
                        </td>
                        <td className="px-4 py-3.5 text-gray-500 text-xs">{row.createdAt.split(/[T ]/)[0]}</td>
                        <td className="px-4 py-3.5 text-center">
                          <button
                            onClick={() => setSelectedPO(row)}
                            className="text-xs font-medium text-emerald-600 hover:text-emerald-800 hover:underline cursor-pointer whitespace-nowrap"
                          >
                            {row.status === 'pending' ? 'Review' : 'View'}
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
            Showing {filtered.length} of {purchases.length}
          </div>
        </div>
      </>

      {selectedPO && (
        <PurchaseDetailModal
          po={selectedPO}
          onClose={() => setSelectedPO(null)}
          onStatusChange={handleStatusChange}
          uploading={uploadingReceipt}
          canDecide={canDecide}
          canCancel={canDecide || selectedPO.submittedBy === requesterIdentity}
        />
      )}
      {showForm && (
        <PurchaseFormModal
          onClose={() => setShowForm(false)}
          onSubmit={handleSubmit}
        />
      )}
    </DashboardLayout>
  );
}
