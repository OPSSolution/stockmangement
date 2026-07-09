import { useState, useMemo, useEffect } from 'react';
import DashboardLayout from '@/components/feature/DashboardLayout';
import { type Vendor } from '@/mocks/vendors';
import VendorDetailModal from './components/VendorDetailModal';
import VendorFormModal from './components/VendorFormModal';
import { supabase } from '@/lib/supabase';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useAuth } from '@/contexts/AuthContext';

type FilterTab = 'all' | 'active' | 'inactive' | 'suspended';

const typeLabel: Record<string, string> = { supplier: 'Supplier', manufacturer: 'Manufacturer', distributor: 'Distributor' };
const typeColor: Record<string, string> = { supplier: 'bg-sky-50 text-sky-700', manufacturer: 'bg-violet-50 text-violet-700', distributor: 'bg-amber-50 text-amber-700' };

function PerformanceBar({ value, color = 'bg-emerald-500' }: { value: number; color?: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-100 rounded-full h-1.5 w-20">
        <div className={`${color} h-1.5 rounded-full`} style={{ width: `${Math.min(value, 100)}%` }}></div>
      </div>
      <span className="text-xs text-gray-600 font-medium w-10 text-right">{value.toFixed(0)}%</span>
    </div>
  );
}

function mapVendor(row: Record<string, unknown>): Vendor {
  return {
    id: row.id as string,
    name: row.name as string,
    type: row.type as Vendor['type'],
    status: row.status as Vendor['status'],
    address: row.address as string,
    city: row.city as string,
    country: row.country as string,
    website: row.website as string | undefined,
    paymentTerms: row.payment_terms as string,
    notes: row.notes as string | undefined,
    registeredAt: row.registered_at as string,
    metrics: (row.metrics as unknown as Vendor['metrics']) || { fulfillmentRate: 0, onTimeDeliveryRate: 0, avgDeliveryDays: 0, totalOrders: 0, fulfilledOrders: 0, rejectedOrders: 0, totalPurchaseValue: 0, lastOrderDate: '' },
    contacts: (row.contacts as unknown as Vendor['contacts']) || [],
    products: (row.products as unknown as Vendor['products']) || [],
    tags: (row.tags as unknown as string[]) || [],
  };
}

export default function VendorsPage() {
  const { canEdit, canDelete, warehouseScope } = useAuth();
  const showEdit = canEdit('vendors');
  const showDelete = canDelete('vendors');
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [search, setSearch] = useState('');
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');
  const [showForm, setShowForm] = useState(false);
  const [editVendor, setEditVendor] = useState<Vendor | null>(null);
  const [deleteVendor, setDeleteVendor] = useState<Vendor | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    fetchVendors();
  }, [warehouseScope]);

  const fetchVendors = async () => {
    setLoading(true);

    // Warehouse-scoped staff only see vendors approved for their own warehouse
    // (the "Approved Vendors" list set on the warehouse detail page) — admins
    // keep the unrestricted, all-vendors view.
    if (warehouseScope) {
      const { data: whRow, error: whError } = await supabase
        .from('warehouses')
        .select('vendor_names')
        .eq('name', warehouseScope)
        .maybeSingle();
      if (whError) {
        console.error(whError);
        setVendors([]);
        setLoading(false);
        return;
      }
      const vendorNames = (whRow?.vendor_names as string[]) || [];
      if (vendorNames.length === 0) {
        setVendors([]);
        setLoading(false);
        return;
      }
      const { data, error } = await supabase.from('vendors').select('*').in('name', vendorNames);
      if (error) {
        console.error(error);
      } else {
        setVendors((data || []).map(mapVendor));
      }
      setLoading(false);
      return;
    }

    const { data, error } = await supabase.from('vendors').select('*');
    if (error) {
      console.error(error);
    } else {
      setVendors((data || []).map(mapVendor));
    }
    setLoading(false);
  };

  const openNew = () => { setEditVendor(null); setShowForm(true); };
  const openEdit = (v: Vendor, e?: React.MouseEvent) => { e?.stopPropagation(); setEditVendor(v); setShowForm(true); };

  const handleSaveVendor = async (data: Omit<Vendor, 'id' | 'metrics' | 'products'> & { id?: string }) => {
    const payload = {
      name: data.name,
      type: data.type,
      status: data.status,
      address: data.address || null,
      city: data.city,
      country: data.country,
      website: data.website || null,
      payment_terms: data.paymentTerms || null,
      notes: data.notes || null,
      tags: data.tags,
      contacts: data.contacts,
      registered_at: data.registeredAt,
    };

    if (data.id) {
      const { error } = await supabase.from('vendors').update(payload).eq('id', data.id);
      if (error) { console.error(error); showToast('Failed to update vendor.', 'error'); return; }
      showToast('Vendor updated.');
    } else {
      const maxNum = vendors.length > 0 ? Math.max(...vendors.map((v) => parseInt(v.id.replace('V', '')) || 0)) : 0;
      const newId = `V${String(maxNum + 1).padStart(3, '0')}`;
      const { error } = await supabase.from('vendors').insert({
        id: newId,
        ...payload,
        metrics: { totalOrders: 0, fulfilledOrders: 0, rejectedOrders: 0, fulfillmentRate: 0, avgDeliveryDays: 0, totalPurchaseValue: 0, lastOrderDate: '', onTimeDeliveryRate: 0 },
        products: [],
      });
      if (error) { console.error(error); showToast('Failed to create vendor.', 'error'); return; }
      showToast('Vendor created.');
    }
    setShowForm(false);
    setEditVendor(null);
    await fetchVendors();
  };

  const handleDeleteVendor = async () => {
    if (!deleteVendor) return;
    const { error } = await supabase.from('vendors').delete().eq('id', deleteVendor.id);
    if (error) {
      console.error(error);
      showToast('Failed to delete vendor.', 'error');
    } else {
      showToast('Vendor deleted.');
      setVendors((prev) => prev.filter((v) => v.id !== deleteVendor.id));
    }
    setDeleteVendor(null);
  };

  const filtered = useMemo(() => {
    return vendors.filter((v) => {
      const matchTab = activeTab === 'all' || v.status === activeTab;
      const q = search.toLowerCase();
      const matchSearch =
        !q ||
        v.name.toLowerCase().includes(q) ||
        v.city.toLowerCase().includes(q) ||
        v.tags.some((t) => t.toLowerCase().includes(q)) ||
        v.products.some((p) => p.productName.toLowerCase().includes(q));
      return matchTab && matchSearch;
    });
  }, [vendors, activeTab, search]);

  const kpi = useMemo(() => ({
    total: vendors.length,
    active: vendors.filter((v) => v.status === 'active').length,
    inactive: vendors.filter((v) => v.status !== 'active').length,
    avgFulfillment: vendors.length > 0 ? Math.round(vendors.reduce((s, v) => s + v.metrics.fulfillmentRate, 0) / vendors.length) : 0,
    totalValue: vendors.reduce((s, v) => s + v.metrics.totalPurchaseValue, 0),
    totalProducts: vendors.reduce((s, v) => s + v.products.length, 0),
  }), [vendors]);

  const tabCount = (key: FilterTab) => key === 'all' ? vendors.length : vendors.filter((v) => v.status === key).length;

  const statusBadge = (status: Vendor['status']) => ({
    active: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    inactive: 'bg-gray-100 text-gray-500 border border-gray-200',
    suspended: 'bg-red-50 text-red-600 border border-red-200',
  }[status]);

  const { formatAmount } = useCurrency();

  return (
    <DashboardLayout title="Vendors" subtitle="Manage vendor profiles, performance metrics and product assignments">
      {toast && (
        <div className={`fixed top-5 right-5 z-[100] flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium shadow-lg ${toast.type === 'error' ? 'bg-red-500' : 'bg-emerald-500'} text-white`}>
          <i className={`${toast.type === 'error' ? 'ri-error-warning-line' : 'ri-check-line'} text-base`}></i>
          {toast.msg}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12 text-gray-400">
          <div className="w-8 h-8 flex items-center justify-center mr-3">
            <i className="ri-loader-4-line animate-spin text-xl"></i>
          </div>
          <span className="text-sm">Loading vendors...</span>
        </div>
      )}

      {!loading && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-6">
            {[
              { label: 'Total Vendors', value: kpi.total, icon: 'ri-store-2-line', color: 'text-gray-600', bg: 'bg-gray-100' },
              { label: 'Active', value: kpi.active, icon: 'ri-checkbox-circle-line', color: 'text-emerald-600', bg: 'bg-emerald-50' },
              { label: 'Inactive', value: kpi.inactive, icon: 'ri-close-circle-line', color: 'text-gray-500', bg: 'bg-gray-100' },
              { label: 'Avg Fulfillment', value: `${kpi.avgFulfillment}%`, icon: 'ri-bar-chart-2-line', color: 'text-sky-600', bg: 'bg-sky-50' },
              { label: 'Total Purchase', value: formatAmount(kpi.totalValue), icon: 'ri-money-dollar-circle-line', color: 'text-violet-600', bg: 'bg-violet-50' },
              { label: 'Products Managed', value: kpi.totalProducts, icon: 'ri-archive-line', color: 'text-amber-600', bg: 'bg-amber-50' },
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

          {/* Toolbar */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-wrap gap-3">
              <div className="flex items-center gap-2 bg-gray-50 rounded-lg p-1">
                {(['all', 'active', 'inactive', 'suspended'] as FilterTab[]).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer capitalize whitespace-nowrap ${activeTab === tab ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${activeTab === tab ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-500'}`}>
                      {tabCount(tab)}
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
                    placeholder="Search vendors, products…"
                    className="pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 w-56 placeholder-gray-400"
                  />
                </div>
                {/* View mode toggle */}
                <div className="flex items-center bg-gray-50 rounded-lg p-1 gap-1">
                  <button
                    onClick={() => setViewMode('table')}
                    className={`w-8 h-7 flex items-center justify-center rounded cursor-pointer transition-all ${viewMode === 'table' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-400 hover:text-gray-600'}`}
                  >
                    <i className="ri-list-check text-sm"></i>
                  </button>
                  <button
                    onClick={() => setViewMode('card')}
                    className={`w-8 h-7 flex items-center justify-center rounded cursor-pointer transition-all ${viewMode === 'card' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-400 hover:text-gray-600'}`}
                  >
                    <i className="ri-grid-line text-sm"></i>
                  </button>
                </div>
                {showEdit && (
                  <button
                    onClick={openNew}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <i className="ri-add-line"></i>New Vendor
                  </button>
                )}
              </div>
            </div>

            {/* Table View */}
            {viewMode === 'table' && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Vendor</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Location</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Products</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Fulfillment</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">On-Time</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Purchase Value</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filtered.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-5 py-12 text-center text-sm text-gray-400">
                          <i className="ri-store-2-line text-3xl block mb-2"></i>No vendors found
                        </td>
                      </tr>
                    ) : (
                      filtered.map((v) => (
                        <tr key={v.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
                                <i className="ri-store-2-line text-emerald-600 text-sm"></i>
                              </div>
                              <div>
                                <p className="font-semibold text-gray-900 text-sm">{v.name}</p>
                                <p className="text-xs text-gray-400">{v.paymentTerms}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            <span className={`text-xs font-medium px-2 py-0.5 rounded ${typeColor[v.type]}`}>{typeLabel[v.type]}</span>
                          </td>
                          <td className="px-4 py-3.5 text-gray-600 text-sm">{v.city}</td>
                          <td className="px-4 py-3.5 text-center font-semibold text-gray-700">{v.products.length}</td>
                          <td className="px-4 py-3.5 w-36">
                            <PerformanceBar
                              value={v.metrics.fulfillmentRate}
                              color={v.metrics.fulfillmentRate >= 90 ? 'bg-emerald-500' : v.metrics.fulfillmentRate >= 70 ? 'bg-amber-400' : 'bg-red-400'}
                            />
                          </td>
                          <td className="px-4 py-3.5 w-36">
                            <PerformanceBar
                              value={v.metrics.onTimeDeliveryRate}
                              color={v.metrics.onTimeDeliveryRate >= 90 ? 'bg-emerald-500' : 'bg-amber-400'}
                            />
                          </td>
                          <td className="px-4 py-3.5 text-right font-semibold text-gray-800">
                            {formatAmount(v.metrics.totalPurchaseValue)}
                          </td>
                          <td className="px-4 py-3.5 text-center">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${statusBadge(v.status)} whitespace-nowrap`}>
                              {v.status.charAt(0).toUpperCase() + v.status.slice(1)}
                            </span>
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => setSelectedVendor(v)}
                                className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 cursor-pointer"
                                title="View vendor"
                              >
                                <i className="ri-eye-line text-sm"></i>
                              </button>
                              {showEdit && (
                                <button
                                  onClick={(e) => openEdit(v, e)}
                                  className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-sky-500 hover:bg-sky-50 cursor-pointer"
                                  title="Edit vendor"
                                >
                                  <i className="ri-edit-line text-sm"></i>
                                </button>
                              )}
                              {showDelete && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); setDeleteVendor(v); }}
                                  className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 cursor-pointer"
                                  title="Delete vendor"
                                >
                                  <i className="ri-delete-bin-line text-sm"></i>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Card View */}
            {viewMode === 'card' && (
              <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filtered.length === 0 ? (
                  <div className="col-span-3 py-12 text-center text-sm text-gray-400">
                    <i className="ri-store-2-line text-3xl block mb-2"></i>No vendors found
                  </div>
                ) : (
                  filtered.map((v) => (
                    <div
                      key={v.id}
                      onClick={() => setSelectedVendor(v)}
                      className="bg-gray-50/60 border border-gray-100 rounded-2xl shadow-sm p-5 cursor-pointer hover:border-emerald-200 transition-all group"
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
                            <i className="ri-store-2-line text-emerald-600"></i>
                          </div>
                          <div>
                            <p className="font-bold text-gray-900 text-sm">{v.name}</p>
                            <p className="text-xs text-gray-500">{v.city} · {typeLabel[v.type]}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${statusBadge(v.status)} whitespace-nowrap`}>
                            {v.status.charAt(0).toUpperCase() + v.status.slice(1)}
                          </span>
                          <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                            {showEdit && (
                              <button
                                onClick={(e) => openEdit(v, e)}
                                className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-sky-500 hover:bg-sky-50 cursor-pointer"
                                title="Edit vendor"
                              >
                                <i className="ri-edit-line text-xs"></i>
                              </button>
                            )}
                            {showDelete && (
                              <button
                                onClick={(e) => { e.stopPropagation(); setDeleteVendor(v); }}
                                className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-red-500 hover:bg-red-50 cursor-pointer"
                                title="Delete vendor"
                              >
                                <i className="ri-delete-bin-line text-xs"></i>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="space-y-2.5">
                        <div>
                          <div className="flex justify-between text-xs text-gray-500 mb-1">
                            <span>Fulfillment</span>
                            <span className="font-medium">{v.metrics.fulfillmentRate.toFixed(1)}%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-1.5">
                            <div
                              className={`h-1.5 rounded-full ${v.metrics.fulfillmentRate >= 90 ? 'bg-emerald-500' : v.metrics.fulfillmentRate >= 70 ? 'bg-amber-400' : 'bg-red-400'}`}
                              style={{ width: `${v.metrics.fulfillmentRate}%` }}
                            ></div>
                          </div>
                        </div>
                        <div>
                          <div className="flex justify-between text-xs text-gray-500 mb-1">
                            <span>On-Time Delivery</span>
                            <span className="font-medium">{v.metrics.onTimeDeliveryRate.toFixed(1)}%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-1.5">
                            <div
                              className={`h-1.5 rounded-full ${v.metrics.onTimeDeliveryRate >= 90 ? 'bg-emerald-500' : 'bg-amber-400'}`}
                              style={{ width: `${v.metrics.onTimeDeliveryRate}%` }}
                            ></div>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200">
                        <div className="text-xs text-gray-500">
                          <span className="font-semibold text-gray-800">{v.products.length}</span> products
                          <span className="mx-2 text-gray-300">·</span>
                          <span className="font-semibold text-gray-800">{v.metrics.totalOrders}</span> orders
                        </div>
                        <p className="text-xs font-bold text-emerald-700">{formatAmount(v.metrics.totalPurchaseValue)}</p>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-3">
                        {v.tags.map((tag) => (
                          <span key={tag} className="px-2 py-0.5 bg-white border border-gray-200 text-gray-600 rounded-full text-xs">{tag}</span>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            <div className="px-5 py-3 border-t border-gray-100 text-xs text-gray-400">
              Showing {filtered.length} of {vendors.length} vendors
            </div>
          </div>
        </>
      )}

      {selectedVendor && (
        <VendorDetailModal
          vendor={selectedVendor}
          onClose={() => setSelectedVendor(null)}
          onEdit={showEdit ? () => { setSelectedVendor(null); openEdit(selectedVendor); } : undefined}
        />
      )}

      {showForm && (
        <VendorFormModal
          vendor={editVendor}
          onClose={() => { setShowForm(false); setEditVendor(null); }}
          onSave={handleSaveVendor}
        />
      )}

      {deleteVendor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-sm mx-4 shadow-xl p-6">
            <div className="flex flex-col items-center text-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
                <i className="ri-delete-bin-line text-red-500 text-xl"></i>
              </div>
              <div>
                <h2 className="text-base font-bold text-gray-900">Delete Vendor?</h2>
                <p className="text-sm text-gray-500 mt-1">
                  You are about to delete <span className="font-semibold text-gray-800">{deleteVendor.name}</span>. This action cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setDeleteVendor(null)}
                className="flex-1 py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer whitespace-nowrap"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteVendor}
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