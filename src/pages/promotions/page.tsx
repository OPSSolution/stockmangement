import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import DashboardLayout from '@/components/feature/DashboardLayout';
import { type Promotion, type PromotionStatus, type PromotionType } from '@/mocks/promotions';
import PromotionStatusBadge from './components/PromotionStatusBadge';
import PromotionFormModal from './components/PromotionFormModal';
import { supabase } from '@/lib/supabase';
import { useCurrency } from '@/contexts/CurrencyContext';

type FilterTab = 'all' | PromotionStatus;

const typeIcons: Record<PromotionType, string> = {
  percentage: 'ri-percent-line',
  fixed_amount: 'ri-price-tag-3-line',
  buy_x_get_y: 'ri-gift-line',
  bundle: 'ri-archive-2-line',
};

const typeLabels: Record<PromotionType, string> = {
  percentage: 'Percentage Off',
  fixed_amount: 'Fixed Amount',
  buy_x_get_y: 'Buy X Get Y',
  bundle: 'Bundle Deal',
};

const typeColors: Record<PromotionType, string> = {
  percentage: 'bg-emerald-50 text-emerald-700',
  fixed_amount: 'bg-sky-50 text-sky-700',
  buy_x_get_y: 'bg-violet-50 text-violet-700',
  bundle: 'bg-amber-50 text-amber-700',
};

function mapPromotion(row: Record<string, unknown>): Promotion {
  return {
    id: row.id as string,
    name: row.name as string,
    type: row.type as PromotionType,
    status: row.status as PromotionStatus,
    description: row.description as string,
    discountValue: row.discount_value as number,
    minOrderAmount: row.min_order_amount as number | undefined,
    maxUsageCount: row.max_usage_count as number | undefined,
    usageCount: row.usage_count as number,
    startDate: row.start_date as string,
    endDate: row.end_date as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    totalRevenue: row.total_revenue as number,
    totalUnitsSold: row.total_units_sold as number,
    bundlePrice: row.bundle_price as number | undefined,
    buyQty: row.buy_qty as number | undefined,
    getQty: row.get_qty as number | undefined,
    products: (row.products as unknown as Promotion['products']) || [],
    bundleItems: (row.bundle_items as unknown as Promotion['bundleItems']) || undefined,
  };
}

export default function PromotionsPage() {
  const { formatAmount } = useCurrency();
  const [searchParams, setSearchParams] = useSearchParams();
  const [promos, setPromos] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    fetchPromotions();
  }, []);

  useEffect(() => {
    if (searchParams.get('action') === 'new') {
      setShowForm(true);
      searchParams.delete('action');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const fetchPromotions = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('promotions').select('*').order('created_at', { ascending: false });
    if (error) {
      console.error(error);
    } else {
      setPromos((data || []).map(mapPromotion));
    }
    setLoading(false);
  };

  const filtered = useMemo(() => {
    return promos.filter((p) => {
      const matchTab = activeTab === 'all' || p.status === activeTab;
      const q = search.toLowerCase();
      const matchSearch = !q || p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q);
      return matchTab && matchSearch;
    });
  }, [promos, activeTab, search]);

  const kpi = useMemo(() => ({
    active: promos.filter((p) => p.status === 'active').length,
    scheduled: promos.filter((p) => p.status === 'scheduled').length,
    paused: promos.filter((p) => p.status === 'paused').length,
    expired: promos.filter((p) => p.status === 'expired').length,
    totalRevenue: promos.filter((p) => p.status !== 'draft').reduce((s, p) => s + p.totalRevenue, 0),
    totalUnitsSold: promos.filter((p) => p.status !== 'draft').reduce((s, p) => s + p.totalUnitsSold, 0),
  }), [promos]);

  const tabCount = (key: FilterTab) => key === 'all' ? promos.length : promos.filter((p) => p.status === key).length;

  const toggleStatus = async (id: string, newStatus: PromotionStatus) => {
    const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const { error } = await supabase.from('promotions').update({ status: newStatus, updated_at: now }).eq('id', id);
    if (error) {
      console.error(error);
    } else {
      const msgs: Partial<Record<PromotionStatus, string>> = {
        active: 'Promotion activated!',
        paused: 'Promotion paused.',
        expired: 'Promotion ended.',
      };
      setSuccessMsg(msgs[newStatus] ?? 'Updated.');
      setTimeout(() => setSuccessMsg(''), 3000);
      await fetchPromotions();
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleFormSubmit = async (data: any) => {
    const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const maxNum = promos.length > 0 ? Math.max(...promos.map(p => parseInt(p.id.replace('PROMO-', '')) || 0)) : 0;
    const newId = `PROMO-${String(maxNum + 1).padStart(3, '0')}`;

    const { error } = await supabase.from('promotions').insert({
      id: newId,
      name: data.name,
      type: data.type,
      status: 'scheduled',
      description: data.description,
      discount_value: data.discountValue,
      min_order_amount: data.minOrderAmount || null,
      max_usage_count: data.maxUsageCount || null,
      usage_count: 0,
      start_date: data.startDate,
      end_date: data.endDate,
      created_at: now,
      updated_at: now,
      total_revenue: 0,
      total_units_sold: 0,
      bundle_price: data.bundlePrice || null,
      buy_qty: data.buyQty || null,
      get_qty: data.getQty || null,
      products: data.products || [],
      bundle_items: data.bundleItems || null,
    });

    if (error) {
      console.error(error);
      setSuccessMsg('Failed to create promotion.');
    } else {
      setShowForm(false);
      setSuccessMsg('Promotion created and scheduled!');
      await fetchPromotions();
    }
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  const getDiscountLabel = (p: Promotion) => {
    if (p.type === 'percentage') return `${p.discountValue}% off`;
    if (p.type === 'fixed_amount') return `${formatAmount(p.discountValue)} off`;
    if (p.type === 'buy_x_get_y') return `Buy ${p.buyQty ?? 2} Get ${p.getQty ?? 1} Free`;
    if (p.type === 'bundle') return `Bundle @ ${formatAmount(p.bundlePrice ?? 0)}`;
    return '-';
  };

  const getStockWarnings = (p: Promotion) => {
    return p.products.filter((prod) => prod.currentStock <= prod.expectedSalesPerDay * 3);
  };

  return (
    <DashboardLayout title="Promotions" subtitle="Manage discount rules, bundle deals, and limited-time offers">
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
          <span className="text-sm">Loading promotions...</span>
        </div>
      )}

      {!loading && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-6">
            {[
              { label: 'Active', value: kpi.active, icon: 'ri-flashlight-line', color: 'text-emerald-600', bg: 'bg-emerald-50', click: 'active' as FilterTab },
              { label: 'Scheduled', value: kpi.scheduled, icon: 'ri-calendar-schedule-line', color: 'text-sky-600', bg: 'bg-sky-50', click: 'scheduled' as FilterTab },
              { label: 'Paused', value: kpi.paused, icon: 'ri-pause-circle-line', color: 'text-amber-600', bg: 'bg-amber-50', click: 'paused' as FilterTab },
              { label: 'Expired', value: kpi.expired, icon: 'ri-time-line', color: 'text-red-500', bg: 'bg-red-50', click: 'expired' as FilterTab },
              { label: 'Promo Revenue', value: formatAmount(kpi.totalRevenue), icon: 'ri-money-dollar-circle-line', color: 'text-violet-600', bg: 'bg-violet-50', click: 'all' as FilterTab },
              { label: 'Units Sold via Promos', value: kpi.totalUnitsSold, icon: 'ri-shopping-bag-3-line', color: 'text-gray-600', bg: 'bg-gray-100', click: 'all' as FilterTab },
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

          {/* Toolbar */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-4">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-wrap gap-3">
              <div className="flex items-center gap-1.5 bg-gray-50 rounded-lg p-1 flex-wrap">
                {(['all', 'active', 'scheduled', 'paused', 'expired', 'draft'] as FilterTab[]).map((tab) => (
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
                    placeholder="Search promotions…"
                    className="pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 w-52 placeholder-gray-400"
                  />
                </div>
                <button
                  onClick={() => setShowForm(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white text-sm font-semibold rounded-lg hover:bg-emerald-600 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <i className="ri-add-line"></i>New Promotion
                </button>
              </div>
            </div>

            {/* Promotions List */}
            <div className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <div className="py-16 text-center text-sm text-gray-400">
                  <i className="ri-price-tag-3-line text-3xl block mb-2"></i>
                  No promotions found
                </div>
              ) : (
                filtered.map((p) => {
                  const isExpanded = expandedId === p.id;
                  const warnings = getStockWarnings(p);
                  const usagePct = p.maxUsageCount ? Math.round((p.usageCount / p.maxUsageCount) * 100) : null;
                  const allProducts = p.type === 'bundle' ? p.bundleItems ?? [] : p.products;

                  return (
                    <div key={p.id} className="transition-all">
                      <div
                        className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50/50 cursor-pointer"
                        onClick={() => setExpandedId(isExpanded ? null : p.id)}
                      >
                        {/* Type Icon */}
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${typeColors[p.type]}`}>
                          <i className={`${typeIcons[p.type]} text-lg`}></i>
                        </div>

                        {/* Name + Meta */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold text-gray-900">{p.name}</p>
                            {warnings.length > 0 && (
                              <span className="flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                                <i className="ri-alert-line"></i>{warnings.length} low stock
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-1 flex-wrap text-xs text-gray-500">
                            <span className={`font-medium px-2 py-0.5 rounded ${typeColors[p.type]}`}>{typeLabels[p.type]}</span>
                            <span className="font-semibold text-gray-700">{getDiscountLabel(p)}</span>
                            <span><i className="ri-calendar-line mr-1"></i>{p.startDate} → {p.endDate}</span>
                            <span>{allProducts.length} products</span>
                          </div>
                        </div>

                        {/* Stats */}
                        <div className="hidden lg:flex items-center gap-6 text-center flex-shrink-0">
                          <div>
                            <p className="text-sm font-bold text-gray-900 tracking-tight">{p.usageCount}</p>
                            <p className="text-xs text-gray-400">Uses</p>
                          </div>
                          <div>
                            <p className="text-sm font-bold text-gray-900 tracking-tight">{p.totalUnitsSold}</p>
                            <p className="text-xs text-gray-400">Units Sold</p>
                          </div>
                          <div>
                            <p className="text-sm font-bold text-emerald-700">{formatAmount(p.totalRevenue)}</p>
                            <p className="text-xs text-gray-400">Revenue</p>
                          </div>
                        </div>

                        {/* Status + Toggle */}
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <PromotionStatusBadge status={p.status} />
                          <div className="flex gap-1.5">
                            {p.status === 'active' && (
                              <button
                                onClick={(e) => { e.stopPropagation(); toggleStatus(p.id, 'paused'); }}
                                className="w-7 h-7 flex items-center justify-center rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100 transition-colors cursor-pointer"
                                title="Pause"
                              >
                                <i className="ri-pause-line text-sm"></i>
                              </button>
                            )}
                            {p.status === 'paused' && (
                              <button
                                onClick={(e) => { e.stopPropagation(); toggleStatus(p.id, 'active'); }}
                                className="w-7 h-7 flex items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors cursor-pointer"
                                title="Resume"
                              >
                                <i className="ri-play-line text-sm"></i>
                              </button>
                            )}
                            {p.status === 'scheduled' && (
                              <button
                                onClick={(e) => { e.stopPropagation(); toggleStatus(p.id, 'active'); }}
                                className="w-7 h-7 flex items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors cursor-pointer"
                                title="Activate"
                              >
                                <i className="ri-flashlight-line text-sm"></i>
                              </button>
                            )}
                            {(p.status === 'active' || p.status === 'paused') && (
                              <button
                                onClick={(e) => { e.stopPropagation(); toggleStatus(p.id, 'expired'); }}
                                className="w-7 h-7 flex items-center justify-center rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors cursor-pointer"
                                title="End promotion"
                              >
                                <i className="ri-stop-circle-line text-sm"></i>
                              </button>
                            )}
                          </div>
                          {isExpanded ? <i className="ri-arrow-up-s-line text-gray-400"></i> : <i className="ri-arrow-down-s-line text-gray-400"></i>}
                        </div>
                      </div>

                      {/* Expanded Detail */}
                      {isExpanded && (
                        <div className="px-5 pb-5 bg-gray-50/40 border-t border-gray-100">
                          <div className="pt-4 grid grid-cols-1 lg:grid-cols-3 gap-5">
                            {/* Products & Stock Impact */}
                            <div className="lg:col-span-2">
                              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Products & Stock Impact</p>
                              <div className="space-y-2">
                                {(p.type === 'bundle' ? (p.bundleItems ?? []) : p.products).map((prod) => {
                                  const isBundle = p.type === 'bundle';
                                  const stock = isBundle
                                    ? (prod as { currentStock?: number }).currentStock ?? 0
                                    : (prod as { currentStock: number }).currentStock;
                                  const price = isBundle
                                    ? (prod as { originalPrice: number }).originalPrice
                                    : (prod as { originalPrice: number }).originalPrice;
                                  const discountedPrice = p.type === 'percentage'
                                    ? price * (1 - p.discountValue / 100)
                                    : p.type === 'fixed_amount'
                                      ? price - p.discountValue
                                      : price;
                                  const stockPct = Math.min((stock / 100) * 100, 100);
                                  const isLow = stock < 10;

                                  return (
                                    <div key={prod.productId} className="flex items-center gap-3 bg-white rounded-lg px-4 py-3 border border-gray-100">
                                      <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0 overflow-hidden">
                                        {prod.imageUrl ? (
                                          <img src={prod.imageUrl} alt={prod.productName} className="w-full h-full object-cover" />
                                        ) : (
                                          <i className="ri-box-3-line text-emerald-500 text-xs"></i>
                                        )}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-gray-800 truncate">{prod.productName}</p>
                                        <p className="text-xs text-gray-400 font-mono">{prod.sku}</p>
                                      </div>
                                      <div className="flex items-center gap-2 flex-shrink-0">
                                        <div className="w-24 bg-gray-100 rounded-full h-1.5">
                                          <div className={`h-1.5 rounded-full ${isLow ? 'bg-red-400' : 'bg-emerald-500'}`} style={{ width: `${stockPct}%` }}></div>
                                        </div>
                                        <span className={`text-xs font-medium w-12 text-right ${isLow ? 'text-red-500' : 'text-gray-600'}`}>{stock} left</span>
                                      </div>
                                      {p.type !== 'bundle' && p.type !== 'buy_x_get_y' && (
                                        <div className="text-right flex-shrink-0">
                                          <p className="text-xs line-through text-gray-400">{formatAmount(price)}</p>
                                          <p className="text-sm font-bold text-emerald-700">{formatAmount(discountedPrice)}</p>
                                        </div>
                                      )}
                                      {p.type === 'bundle' && (
                                        <div className="text-right flex-shrink-0">
                                          <p className="text-xs text-gray-500">{formatAmount(price)}</p>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                              {p.type === 'bundle' && p.bundleItems && p.bundlePrice && (
                                <div className="mt-2 flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-sm">
                                  <span className="text-gray-600">
                                    Original total: <span className="line-through text-gray-400">{formatAmount(p.bundleItems.reduce((s, i) => s + i.originalPrice * i.quantity, 0))}</span>
                                  </span>
                                  <span className="font-bold text-emerald-700">Bundle Price: {formatAmount(p.bundlePrice)}</span>
                                </div>
                              )}
                            </div>

                            {/* Promo Stats */}
                            <div className="space-y-3">
                              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Performance</p>
                              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
                                {[
                                  { label: 'Total Revenue', val: formatAmount(p.totalRevenue), icon: 'ri-money-dollar-circle-line', color: 'text-emerald-600' },
                                  { label: 'Units Sold', val: `${p.totalUnitsSold}`, icon: 'ri-shopping-bag-3-line', color: 'text-sky-600' },
                                  { label: 'Usage Count', val: `${p.usageCount}${p.maxUsageCount ? ` / ${p.maxUsageCount}` : ''}`, icon: 'ri-user-3-line', color: 'text-violet-600' },
                                ].map((s) => (
                                  <div key={s.label} className="flex items-center justify-between text-sm">
                                    <div className="flex items-center gap-2 text-gray-500">
                                      <i className={`${s.icon} ${s.color}`}></i>
                                      {s.label}
                                    </div>
                                    <span className="font-bold text-gray-900">{s.val}</span>
                                  </div>
                                ))}
                                {usagePct !== null && (
                                  <div>
                                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                                      <span>Usage Limit</span>
                                      <span>{usagePct}%</span>
                                    </div>
                                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                                      <div className={`h-1.5 rounded-full ${usagePct >= 80 ? 'bg-red-400' : 'bg-emerald-500'}`} style={{ width: `${usagePct}%` }}></div>
                                    </div>
                                  </div>
                                )}
                              </div>
                              {p.description && (
                                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Description</p>
                                  <p className="text-sm text-gray-600">{p.description}</p>
                                </div>
                              )}
                              {p.minOrderAmount && (
                                <div className="flex items-center gap-2 text-xs text-sky-700 bg-sky-50 border border-sky-200 rounded-lg px-3 py-2">
                                  <i className="ri-information-line"></i>
                                  Min. order: {formatAmount(p.minOrderAmount)}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <div className="px-5 py-3 border-t border-gray-100 text-xs text-gray-400">
              Showing {filtered.length} of {promos.length} promotions
            </div>
          </div>
        </>
      )}

      {showForm && (
        <PromotionFormModal
          onClose={() => setShowForm(false)}
          onSubmit={handleFormSubmit}
        />
      )}
    </DashboardLayout>
  );
}