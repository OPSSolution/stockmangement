import { useState, useMemo, useEffect } from 'react';
import DashboardLayout from '@/components/feature/DashboardLayout';
import { type Vendor } from '@/mocks/vendors';
import VendorDetailModal from './components/VendorDetailModal';
import { supabase } from '@/lib/supabase';
import { useCurrency } from '@/contexts/CurrencyContext';

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
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [search, setSearch] = useState('');
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');

  useEffect(() => {
    fetchVendors();
  }, []);

  const fetchVendors = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('vendors').select('*');
    if (error) {
      console.error(error);
    } else {
      setVendors((data || []).map(mapVendor));
    }
    setLoading(false);
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
                          <td className="px-4 py-3.5 text-center">
                            <button
                              onClick={() => setSelectedVendor(v)}
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
                      className="bg-gray-50/60 border border-gray-100 rounded-2xl shadow-sm p-5 cursor-pointer hover:border-emerald-200 transition-all"
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
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${statusBadge(v.status)} whitespace-nowrap`}>
                          {v.status.charAt(0).toUpperCase() + v.status.slice(1)}
                        </span>
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
        />
      )}
    </DashboardLayout>
  );
}