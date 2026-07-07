import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import DashboardLayout from '@/components/feature/DashboardLayout';
import RevenueChart from './components/RevenueChart';
import TopProductsTable from './components/TopProductsTable';
import CategoryBreakdownChart from './components/CategoryBreakdownChart';
import ReturnReasonsChart from './components/ReturnReasonsChart';
import WarehousePerformancePanel from './components/WarehousePerformancePanel';
import ExportMenu from './components/ExportMenu';
import { api } from '@/lib/api';
import { useCurrency } from '@/contexts/CurrencyContext';

type Period = 'daily' | 'monthly' | 'yearly';

interface ModuleData {
  count: number;
  revenue?: number;
  total?: number;
  refunded?: number;
  statusBreakdown?: Record<string, number>;
}

interface PeriodData {
  orders: ModuleData;
  deliveries: ModuleData;
  transfers: ModuleData;
  purchases: ModuleData;
  returns: ModuleData;
  promotions: ModuleData;
}

interface TrendPoint { label: string; orders: number; revenue: number; }

interface ReportSummary {
  period: Period;
  current: PeriodData;
  previous: PeriodData;
  trend: TrendPoint[];
}

const STATUS_COLORS: Record<string, string> = {
  pending:    'bg-amber-50 text-amber-700',
  accepted:   'bg-sky-50 text-sky-700',
  processing: 'bg-blue-50 text-blue-700',
  fulfilled:  'bg-emerald-50 text-emerald-700',
  partial:    'bg-teal-50 text-teal-700',
  rejected:   'bg-red-50 text-red-600',
  prepare:    'bg-amber-50 text-amber-700',
  ready:      'bg-sky-50 text-sky-700',
  in_transit: 'bg-violet-50 text-violet-700',
  delivered:  'bg-emerald-50 text-emerald-700',
  requested:  'bg-amber-50 text-amber-700',
  approved:   'bg-sky-50 text-sky-700',
  received:   'bg-emerald-50 text-emerald-700',
  cancelled:  'bg-red-50 text-red-600',
  submitted:  'bg-gray-100 text-gray-700',
  ordered:    'bg-blue-50 text-blue-700',
  inspecting: 'bg-amber-50 text-amber-700',
  restocked:  'bg-emerald-50 text-emerald-700',
  refunded:   'bg-sky-50 text-sky-700',
  discarded:  'bg-gray-100 text-gray-600',
  draft:      'bg-gray-100 text-gray-600',
  scheduled:  'bg-sky-50 text-sky-700',
  active:     'bg-emerald-50 text-emerald-700',
  paused:     'bg-amber-50 text-amber-700',
  expired:    'bg-red-50 text-red-600',
};

const MODULE_CHIPS = [
  { label: 'Orders',     icon: 'ri-shopping-bag-3-line',  color: 'text-emerald-600', bg: 'bg-emerald-50', ring: 'ring-emerald-300' },
  { label: 'Deliveries', icon: 'ri-truck-line',            color: 'text-sky-600',     bg: 'bg-sky-50',     ring: 'ring-sky-300' },
  { label: 'Transfers',  icon: 'ri-swap-box-line',         color: 'text-violet-600',  bg: 'bg-violet-50',  ring: 'ring-violet-300' },
  { label: 'Purchases',  icon: 'ri-shopping-cart-2-line',  color: 'text-amber-600',   bg: 'bg-amber-50',   ring: 'ring-amber-300' },
  { label: 'Returns',    icon: 'ri-arrow-go-back-line',    color: 'text-red-500',     bg: 'bg-red-50',     ring: 'ring-red-300' },
  { label: 'Promotions', icon: 'ri-price-tag-3-line',      color: 'text-pink-500',    bg: 'bg-pink-50',    ring: 'ring-pink-300' },
];

function growth(curr: number, prev: number): number | null {
  if (prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}

function GrowthBadge({ curr, prev }: { curr: number; prev: number }) {
  const g = growth(curr, prev);
  if (g === null) return <span className="text-xs text-gray-400">No prev data</span>;
  const up = g >= 0;
  return (
    <span className={`text-xs font-semibold flex items-center gap-0.5 ${up ? 'text-emerald-600' : 'text-red-500'}`}>
      <i className={`${up ? 'ri-arrow-up-line' : 'ri-arrow-down-line'} text-xs`}></i>
      {Math.abs(g).toFixed(1)}%
    </span>
  );
}

function periodLabel(period: Period, value: string): string {
  if (period === 'daily') {
    return new Date(value + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }
  if (period === 'monthly') {
    const [y, m] = value.split('-');
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }
  return value;
}

function navigatePeriod(period: Period, value: string, dir: -1 | 1): string {
  if (period === 'daily') {
    const d = new Date(value + 'T00:00:00'); d.setDate(d.getDate() + dir);
    return d.toISOString().slice(0, 10);
  }
  if (period === 'monthly') {
    const [y, m] = value.split('-').map(Number);
    const next = new Date(y, m - 1 + dir, 1);
    return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
  }
  return String(Number(value) + dir);
}

function defaultValue(period: Period): string {
  const now = new Date();
  if (period === 'daily') return now.toISOString().slice(0, 10);
  if (period === 'monthly') return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return String(now.getFullYear());
}

function TrendChart({ trend, formatAmount }: { trend: TrendPoint[]; formatAmount: (n: number) => string }) {
  const maxRevenue = Math.max(...trend.map((t) => t.revenue), 1);
  const maxOrders  = Math.max(...trend.map((t) => t.orders),  1);
  const [hover, setHover] = useState<number | null>(null);
  return (
    <div className="mt-4">
      <div className="flex items-end gap-2 h-28">
        {trend.map((t, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1 relative"
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            {hover === i && (
              <div className="absolute -top-14 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs rounded-lg px-2.5 py-1.5 z-10 whitespace-nowrap shadow-lg">
                <p className="font-semibold">{t.label}</p>
                <p>{t.orders} orders · {formatAmount(t.revenue)}</p>
              </div>
            )}
            <div className="w-full flex gap-0.5 items-end h-24">
              <div className="flex-1 bg-emerald-200 hover:bg-emerald-300 rounded-t transition-colors cursor-pointer"
                style={{ height: `${Math.max(4, Math.round((t.revenue / maxRevenue) * 96))}px` }}></div>
              <div className="flex-1 bg-sky-200 hover:bg-sky-300 rounded-t transition-colors cursor-pointer"
                style={{ height: `${Math.max(4, Math.round((t.orders / maxOrders) * 96))}px` }}></div>
            </div>
            <p className="text-[9px] text-gray-400 truncate w-full text-center">{t.label}</p>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-4 mt-2">
        <span className="flex items-center gap-1.5 text-xs text-gray-500"><span className="w-3 h-2 bg-emerald-200 rounded-sm inline-block"></span>Revenue</span>
        <span className="flex items-center gap-1.5 text-xs text-gray-500"><span className="w-3 h-2 bg-sky-200 rounded-sm inline-block"></span>Orders</span>
      </div>
    </div>
  );
}

function StatusBadges({ breakdown }: { breakdown: Record<string, number> }) {
  const entries = Object.entries(breakdown).filter(([, v]) => v > 0);
  if (!entries.length) return <span className="text-xs text-gray-400">—</span>;
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {entries.map(([status, count]) => (
        <span key={status} className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full whitespace-nowrap font-medium ${STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-600'}`}>
          {status.replace(/_/g, ' ')}
          <span className="font-bold opacity-80">{count}</span>
        </span>
      ))}
    </div>
  );
}

export default function ReportsPage() {
  const { formatAmount } = useCurrency();
  const [period, setPeriod]             = useState<Period>('monthly');
  const [periodValue, setPeriodValue]   = useState<string>(() => defaultValue('monthly'));
  const [summary, setSummary]           = useState<ReportSummary | null>(null);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [warehouse, setWarehouse]       = useState<string>('');
  const [selectedModules, setSelectedModules] = useState<Set<string>>(new Set());
  const autoNavCount   = useRef(0);
  const userNavigated  = useRef(false);

  const toggleModule = (label: string) => {
    setSelectedModules(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label); else next.add(label);
      return next;
    });
  };

  const fetchSummary = useCallback(async (p: Period, v: string, wh: string) => {
    setLoading(true);
    setError(null);
    const body: Record<string, string> = { period: p };
    if (p === 'daily')        body.date  = v;
    else if (p === 'monthly') body.month = v;
    else                      body.year  = v;
    if (wh) body.warehouse = wh;
    const { data, error: err } = await api.functions.invoke('report-summary', { body });
    if (err || !data) setError(err?.message || 'Failed to load report');
    else setSummary(data as ReportSummary);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSummary(period, periodValue, warehouse);
  }, [period, periodValue, warehouse, fetchSummary]);

  // Auto-navigate backwards to the most recent period that has data (only on initial load,
  // before the user manually touches the navigator).
  useEffect(() => {
    if (loading || summary === null || userNavigated.current) return;
    const total = (summary.current.orders.count ?? 0)
      + (summary.current.deliveries.count ?? 0)
      + (summary.current.transfers.count ?? 0)
      + (summary.current.purchases.count ?? 0)
      + (summary.current.returns.count ?? 0)
      + (summary.current.promotions.count ?? 0);
    if (total === 0 && autoNavCount.current < 24) {
      autoNavCount.current += 1;
      setPeriodValue(v => navigatePeriod(period, v, -1));
    }
  }, [summary, loading, period]);

  const handlePeriodChange = (p: Period) => {
    setPeriod(p);
    setPeriodValue(defaultValue(p));
    autoNavCount.current  = 0;
    userNavigated.current = false;
  };

  const cur   = summary?.current;
  const prv   = summary?.previous;
  const trend = summary?.trend ?? [];

  const totalRevenue = cur?.orders.revenue ?? 0;
  const prevRevenue  = prv?.orders.revenue ?? 0;
  const totalOrders  = cur?.orders.count   ?? 0;
  const prevOrders   = prv?.orders.count   ?? 0;

  // Helper: access statusBreakdown safely
  const sb  = useCallback((m: keyof PeriodData, k: string) => cur?.[m]?.statusBreakdown?.[k]  ?? 0, [cur]);
  const psb = useCallback((m: keyof PeriodData, k: string) => prv?.[m]?.statusBreakdown?.[k]  ?? 0, [prv]);

  // KPI cards — switch content based on selected module
  const kpiCards = useMemo(() => {
    const defaultCards = [
      { label: 'Total Revenue',    value: formatAmount(totalRevenue),             curr: totalRevenue,               prev: prevRevenue,                icon: 'ri-money-dollar-circle-line', bg: 'bg-emerald-50', color: 'text-emerald-600' },
      { label: 'Total Orders',     value: String(totalOrders),                    curr: totalOrders,                prev: prevOrders,                 icon: 'ri-shopping-bag-3-line',      bg: 'bg-sky-50',     color: 'text-sky-600' },
      { label: 'Total Returns',    value: String(cur?.returns.count    ?? 0),     curr: cur?.returns.count    ?? 0, prev: prv?.returns.count    ?? 0, icon: 'ri-arrow-go-back-line',       bg: 'bg-red-50',     color: 'text-red-500' },
      { label: 'Total Deliveries', value: String(cur?.deliveries.count ?? 0),     curr: cur?.deliveries.count ?? 0, prev: prv?.deliveries.count ?? 0, icon: 'ri-truck-line',               bg: 'bg-violet-50',  color: 'text-violet-600' },
    ];
    if (selectedModules.size !== 1) return defaultCards;
    const mod = [...selectedModules][0];
    switch (mod) {
      case 'Orders':
        return [
          { label: 'Total Orders', value: String(totalOrders),            curr: totalOrders,                   prev: prevOrders,                    icon: 'ri-shopping-bag-3-line',      bg: 'bg-emerald-50', color: 'text-emerald-600' },
          { label: 'Revenue',      value: formatAmount(totalRevenue),      curr: totalRevenue,                  prev: prevRevenue,                   icon: 'ri-money-dollar-circle-line', bg: 'bg-sky-50',     color: 'text-sky-600' },
          { label: 'Fulfilled',    value: String(sb('orders','fulfilled')),curr: sb('orders','fulfilled'),      prev: psb('orders','fulfilled'),     icon: 'ri-checkbox-circle-line',     bg: 'bg-teal-50',    color: 'text-teal-600' },
          { label: 'Pending',      value: String(sb('orders','pending')),  curr: sb('orders','pending'),        prev: psb('orders','pending'),       icon: 'ri-time-line',                bg: 'bg-amber-50',   color: 'text-amber-600' },
        ];
      case 'Deliveries':
        return [
          { label: 'Deliveries',   value: String(cur?.deliveries.count ?? 0),                             curr: cur?.deliveries.count ?? 0,     prev: prv?.deliveries.count ?? 0,    icon: 'ri-truck-line',           bg: 'bg-sky-50',     color: 'text-sky-600' },
          { label: 'In Transit',   value: String(sb('deliveries','in_transit')),                           curr: sb('deliveries','in_transit'),   prev: psb('deliveries','in_transit'), icon: 'ri-route-line',           bg: 'bg-violet-50',  color: 'text-violet-600' },
          { label: 'Delivered',    value: String(sb('deliveries','delivered')),                            curr: sb('deliveries','delivered'),    prev: psb('deliveries','delivered'),  icon: 'ri-checkbox-circle-line', bg: 'bg-emerald-50', color: 'text-emerald-600' },
          { label: 'Preparing',    value: String(sb('deliveries','prepare') + sb('deliveries','ready')),  curr: sb('deliveries','prepare') + sb('deliveries','ready'), prev: psb('deliveries','prepare') + psb('deliveries','ready'), icon: 'ri-loader-line', bg: 'bg-amber-50', color: 'text-amber-600' },
        ];
      case 'Transfers':
        return [
          { label: 'Transfers',  value: String(cur?.transfers.count ?? 0),          curr: cur?.transfers.count ?? 0,    prev: prv?.transfers.count ?? 0,     icon: 'ri-swap-box-line',        bg: 'bg-violet-50',  color: 'text-violet-600' },
          { label: 'In Transit', value: String(sb('transfers','in_transit')),        curr: sb('transfers','in_transit'), prev: psb('transfers','in_transit'),  icon: 'ri-route-line',           bg: 'bg-blue-50',    color: 'text-blue-600' },
          { label: 'Received',   value: String(sb('transfers','received')),          curr: sb('transfers','received'),   prev: psb('transfers','received'),    icon: 'ri-checkbox-circle-line', bg: 'bg-emerald-50', color: 'text-emerald-600' },
          { label: 'Requested',  value: String(sb('transfers','requested')),         curr: sb('transfers','requested'),  prev: psb('transfers','requested'),   icon: 'ri-time-line',            bg: 'bg-amber-50',   color: 'text-amber-600' },
        ];
      case 'Purchases':
        return [
          { label: 'Purchases',    value: String(cur?.purchases.count ?? 0),         curr: cur?.purchases.count ?? 0,    prev: prv?.purchases.count ?? 0,     icon: 'ri-shopping-cart-2-line', bg: 'bg-amber-50',   color: 'text-amber-600' },
          { label: 'Total Value',  value: formatAmount(cur?.purchases.total ?? 0),    curr: cur?.purchases.total  ?? 0,   prev: prv?.purchases.total  ?? 0,    icon: 'ri-money-dollar-circle-line', bg: 'bg-sky-50', color: 'text-sky-600' },
          { label: 'Ordered',      value: String(sb('purchases','ordered')),          curr: sb('purchases','ordered'),    prev: psb('purchases','ordered'),     icon: 'ri-file-list-line',       bg: 'bg-blue-50',    color: 'text-blue-600' },
          { label: 'Received',     value: String(sb('purchases','received')),         curr: sb('purchases','received'),   prev: psb('purchases','received'),    icon: 'ri-checkbox-circle-line', bg: 'bg-emerald-50', color: 'text-emerald-600' },
        ];
      case 'Returns':
        return [
          { label: 'Returns',   value: String(cur?.returns.count ?? 0),              curr: cur?.returns.count    ?? 0,   prev: prv?.returns.count    ?? 0,    icon: 'ri-arrow-go-back-line',   bg: 'bg-red-50',     color: 'text-red-500' },
          { label: 'Refunded',  value: formatAmount(cur?.returns.refunded ?? 0),      curr: cur?.returns.refunded ?? 0,   prev: prv?.returns.refunded ?? 0,    icon: 'ri-money-dollar-circle-line', bg: 'bg-sky-50', color: 'text-sky-600' },
          { label: 'Approved',  value: String(sb('returns','approved')),              curr: sb('returns','approved'),     prev: psb('returns','approved'),     icon: 'ri-checkbox-circle-line', bg: 'bg-emerald-50', color: 'text-emerald-600' },
          { label: 'Pending',   value: String(sb('returns','pending')),               curr: sb('returns','pending'),      prev: psb('returns','pending'),      icon: 'ri-time-line',            bg: 'bg-amber-50',   color: 'text-amber-600' },
        ];
      case 'Promotions':
        return [
          { label: 'Promotions', value: String(cur?.promotions.count ?? 0),          curr: cur?.promotions.count  ?? 0,  prev: prv?.promotions.count  ?? 0,   icon: 'ri-price-tag-3-line',     bg: 'bg-pink-50',    color: 'text-pink-500' },
          { label: 'Active',     value: String(sb('promotions','active')),            curr: sb('promotions','active'),    prev: psb('promotions','active'),     icon: 'ri-play-circle-line',     bg: 'bg-emerald-50', color: 'text-emerald-600' },
          { label: 'Scheduled',  value: String(sb('promotions','scheduled')),         curr: sb('promotions','scheduled'), prev: psb('promotions','scheduled'),  icon: 'ri-calendar-line',        bg: 'bg-sky-50',     color: 'text-sky-600' },
          { label: 'Expired',    value: String(sb('promotions','expired')),           curr: sb('promotions','expired'),   prev: psb('promotions','expired'),    icon: 'ri-close-circle-line',    bg: 'bg-gray-100',   color: 'text-gray-500' },
        ];
      default:
        return defaultCards;
    }
  }, [selectedModules, cur, prv, formatAmount, totalRevenue, prevRevenue, totalOrders, prevOrders, sb, psb]);

  const allModules = [
    { label: 'Orders',     icon: 'ri-shopping-bag-3-line',  bg: 'bg-emerald-50', iconColor: 'text-emerald-600', count: cur?.orders.count     ?? 0, prevCount: prv?.orders.count     ?? 0, value: cur?.orders.revenue  ?? 0, prevValue: prv?.orders.revenue  ?? 0, showValue: true,  valueLabel: 'Revenue',     statusBreakdown: cur?.orders.statusBreakdown     ?? {} },
    { label: 'Deliveries', icon: 'ri-truck-line',            bg: 'bg-sky-50',     iconColor: 'text-sky-600',     count: cur?.deliveries.count ?? 0, prevCount: prv?.deliveries.count ?? 0, value: 0,                         prevValue: 0,                          showValue: false, valueLabel: '',            statusBreakdown: cur?.deliveries.statusBreakdown ?? {} },
    { label: 'Transfers',  icon: 'ri-swap-box-line',         bg: 'bg-violet-50',  iconColor: 'text-violet-600',  count: cur?.transfers.count  ?? 0, prevCount: prv?.transfers.count  ?? 0, value: 0,                         prevValue: 0,                          showValue: false, valueLabel: '',            statusBreakdown: cur?.transfers.statusBreakdown  ?? {} },
    { label: 'Purchases',  icon: 'ri-shopping-cart-2-line',  bg: 'bg-amber-50',   iconColor: 'text-amber-600',   count: cur?.purchases.count  ?? 0, prevCount: prv?.purchases.count  ?? 0, value: cur?.purchases.total ?? 0, prevValue: prv?.purchases.total ?? 0,  showValue: true,  valueLabel: 'Total Value', statusBreakdown: cur?.purchases.statusBreakdown  ?? {} },
    { label: 'Returns',    icon: 'ri-arrow-go-back-line',    bg: 'bg-red-50',     iconColor: 'text-red-500',     count: cur?.returns.count    ?? 0, prevCount: prv?.returns.count    ?? 0, value: cur?.returns.refunded ?? 0,prevValue: prv?.returns.refunded ?? 0, showValue: true,  valueLabel: 'Refunded',   statusBreakdown: cur?.returns.statusBreakdown    ?? {} },
    { label: 'Promotions', icon: 'ri-price-tag-3-line',      bg: 'bg-pink-50',    iconColor: 'text-pink-500',    count: cur?.promotions.count ?? 0, prevCount: prv?.promotions.count ?? 0, value: 0,                         prevValue: 0,                          showValue: false, valueLabel: '',            statusBreakdown: cur?.promotions.statusBreakdown ?? {} },
  ];

  const visibleModules = selectedModules.size === 0
    ? allModules
    : allModules.filter(m => selectedModules.has(m.label));

  const totalCount = allModules.reduce((s, m) => s + m.count, 0);
  const hasNoData  = !loading && summary !== null && totalCount === 0;

  return (
    <DashboardLayout title="Reports &amp; Analytics" subtitle="Daily, monthly and yearly performance across all modules">

      {/* Period selector + navigator + export */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          {(['daily', 'monthly', 'yearly'] as Period[]).map((p) => (
            <button key={p} onClick={() => handlePeriodChange(p)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer capitalize ${period === p ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {p}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { userNavigated.current = true; setPeriodValue((v) => navigatePeriod(period, v, -1)); }}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer">
            <i className="ri-arrow-left-s-line text-gray-500"></i>
          </button>
          <span className="text-sm font-semibold text-gray-800 min-w-[180px] text-center">
            {periodLabel(period, periodValue)}
          </span>
          <button onClick={() => { userNavigated.current = true; setPeriodValue((v) => navigatePeriod(period, v, 1)); }}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer">
            <i className="ri-arrow-right-s-line text-gray-500"></i>
          </button>
        </div>
        <ExportMenu />
      </div>

      {/* Filter bar — single scrollable row */}
      <div className="flex items-center gap-2 mb-5 bg-gray-50 border border-gray-100 rounded-2xl shadow-sm px-3 py-2.5">
        <span className="text-xs font-medium text-gray-400 uppercase tracking-wide flex-shrink-0">Module</span>
        <div className="flex items-center gap-1.5 overflow-x-auto flex-1 scrollbar-hide">
          <button onClick={() => setSelectedModules(new Set())}
            className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
              selectedModules.size === 0 ? 'bg-gray-900 text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'
            }`}>
            All
          </button>
          {MODULE_CHIPS.map((chip) => {
            const active = selectedModules.has(chip.label);
            return (
              <button key={chip.label} onClick={() => toggleModule(chip.label)}
                className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
                  active ? `${chip.bg} ${chip.color} ring-1 ${chip.ring}` : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'
                }`}>
                <i className={`${chip.icon} text-xs`}></i>
                {chip.label}
              </button>
            );
          })}
        </div>
        <div className="flex-shrink-0 flex items-center gap-1.5 pl-2 border-l border-gray-200">
          <i className="ri-building-2-line text-gray-400 text-sm"></i>
          <select value={warehouse} onChange={(e) => setWarehouse(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-300">
            <option value="">All Warehouses</option>
            <option value="BM Warehouse">BM Warehouse</option>
            <option value="Vendor Warehouse">Vendor Warehouse</option>
          </select>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-5 text-sm text-red-700 flex items-center gap-2">
          <i className="ri-error-warning-line"></i> {error}
        </div>
      )}

      {/* No data banner */}
      {hasNoData && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-amber-700 text-sm">
            <i className="ri-information-line text-base"></i>
            No activity recorded for <strong>{periodLabel(period, periodValue)}</strong>
          </div>
          <button onClick={() => { userNavigated.current = true; setPeriodValue((v) => navigatePeriod(period, v, -1)); }}
            className="flex-shrink-0 flex items-center gap-1 text-xs font-semibold text-amber-700 hover:text-amber-800 cursor-pointer bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap">
            <i className="ri-arrow-left-s-line"></i> Previous period
          </button>
        </div>
      )}

      {/* KPI Cards — dynamic per selected module */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        {kpiCards.map((k) => (
          <div key={k.label} className="bg-white border border-gray-100 rounded-2xl shadow-sm p-4">
            {loading ? (
              <div className="animate-pulse space-y-2">
                <div className="w-9 h-9 bg-gray-100 rounded-lg"></div>
                <div className="h-6 bg-gray-100 rounded w-20"></div>
                <div className="h-3 bg-gray-100 rounded w-24"></div>
              </div>
            ) : (
              <>
                <div className={`w-9 h-9 ${k.bg} rounded-lg flex items-center justify-center mb-2`}>
                  <i className={`${k.icon} ${k.color}`}></i>
                </div>
                <p className="text-xl font-bold text-gray-900 tracking-tight">{k.value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{k.label}</p>
                <div className="mt-1"><GrowthBadge curr={k.curr} prev={k.prev} /></div>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Trend + highlights */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 mb-5">
        <div className="lg:col-span-3 bg-white border border-gray-100 rounded-2xl shadow-sm p-5">
          <h3 className="text-sm font-bold text-gray-900 tracking-tight">Trend — Orders &amp; Revenue</h3>
          <p className="text-xs text-gray-400 mt-0.5 capitalize">{period} breakdown · hover bars for details</p>
          {loading ? (
            <div className="h-36 flex items-center justify-center text-gray-400">
              <i className="ri-loader-4-line animate-spin text-xl"></i>
            </div>
          ) : <TrendChart trend={trend} formatAmount={formatAmount} />}
        </div>

        <div className="lg:col-span-2 bg-white border border-gray-100 rounded-2xl shadow-sm p-5">
          <h3 className="text-sm font-bold text-gray-900 mb-3">Period Highlights</h3>
          {loading ? (
            <div className="space-y-3">{Array(6).fill(0).map((_, i) => <div key={i} className="h-9 bg-gray-100 rounded-lg animate-pulse"></div>)}</div>
          ) : (
            <div className="space-y-2">
              {[
                { label: 'Avg Order Value',       value: totalOrders > 0 ? formatAmount(totalRevenue / totalOrders) : '—',                  bg: 'bg-emerald-50', textLabel: 'text-emerald-700', textValue: 'text-emerald-800' },
                { label: 'Return Rate',            value: totalOrders > 0 ? (((cur?.returns.count ?? 0) / totalOrders) * 100).toFixed(1) + '%' : '—', bg: 'bg-sky-50', textLabel: 'text-sky-700', textValue: 'text-sky-800' },
                { label: 'Purchases Value',        value: formatAmount(cur?.purchases.total  ?? 0),                                          bg: 'bg-violet-50',  textLabel: 'text-violet-700', textValue: 'text-violet-800' },
                { label: 'Refunds Issued',         value: formatAmount(cur?.returns.refunded ?? 0),                                          bg: 'bg-amber-50',   textLabel: 'text-amber-700',  textValue: 'text-amber-800' },
                { label: 'Active Promotions',      value: String(cur?.promotions.statusBreakdown?.active ?? 0),                              bg: 'bg-pink-50',    textLabel: 'text-pink-700',   textValue: 'text-pink-800' },
                { label: 'Transfers Initiated',    value: String(cur?.transfers.count ?? 0),                                                 bg: 'bg-gray-50',    textLabel: 'text-gray-600',   textValue: 'text-gray-800' },
              ].map((row) => (
                <div key={row.label} className={`flex items-center justify-between px-3 py-2.5 ${row.bg} rounded-lg`}>
                  <span className={`text-xs font-medium ${row.textLabel}`}>{row.label}</span>
                  <span className={`text-xs font-bold ${row.textValue}`}>{row.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Module Breakdown Table */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm mb-5 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-gray-900 tracking-tight">Module Breakdown</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {periodLabel(period, periodValue)}
              {warehouse && <span className="ml-1.5 font-medium text-emerald-600">· {warehouse}</span>}
              {selectedModules.size > 0 && <span className="ml-1.5 font-medium text-violet-600">· {[...selectedModules].join(', ')}</span>}
            </p>
          </div>
          {selectedModules.size > 0 && (
            <button onClick={() => setSelectedModules(new Set())}
              className="text-xs text-gray-400 hover:text-gray-600 cursor-pointer flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-gray-50">
              <i className="ri-close-line"></i> Clear
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3 uppercase tracking-wide">Module</th>
                <th className="text-right text-xs font-semibold text-gray-500 px-4 py-3 uppercase tracking-wide">Count</th>
                <th className="text-right text-xs font-semibold text-gray-500 px-4 py-3 uppercase tracking-wide">vs Prev</th>
                <th className="text-right text-xs font-semibold text-gray-500 px-4 py-3 uppercase tracking-wide">Value</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 uppercase tracking-wide">Status Breakdown</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array(6).fill(0).map((_, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    <td colSpan={5} className="px-5 py-3"><div className="h-5 bg-gray-100 rounded animate-pulse"></div></td>
                  </tr>
                ))
              ) : visibleModules.map((mod) => (
                <tr key={mod.label} className="border-b border-gray-50 last:border-b-0 hover:bg-gray-50/50 transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-7 h-7 ${mod.bg} rounded-lg flex items-center justify-center`}>
                        <i className={`${mod.icon} ${mod.iconColor} text-sm`}></i>
                      </div>
                      <span className="text-sm font-semibold text-gray-800">{mod.label}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <span className="text-sm font-bold text-gray-900 tracking-tight">{mod.count}</span>
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <GrowthBadge curr={mod.count} prev={mod.prevCount} />
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    {mod.showValue ? (
                      <div>
                        <span className="text-sm font-semibold text-gray-800">{formatAmount(mod.value)}</span>
                        {mod.valueLabel && <div className="text-xs text-gray-400 mt-0.5">{mod.valueLabel}</div>}
                      </div>
                    ) : <span className="text-sm text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3.5">
                    <StatusBadges breakdown={mod.statusBreakdown} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Divider */}
      <div className="flex items-center gap-3 mb-5">
        <div className="flex-1 h-px bg-gray-100"></div>
        <span className="text-xs text-gray-400 font-medium uppercase tracking-widest px-2">Detailed Analytics</span>
        <div className="flex-1 h-px bg-gray-100"></div>
      </div>

      <div className="mb-5"><RevenueChart /></div>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 mb-5">
        <div className="lg:col-span-3"><TopProductsTable /></div>
        <div className="lg:col-span-2"><CategoryBreakdownChart /></div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        <div className="lg:col-span-2"><ReturnReasonsChart /></div>
        <div className="lg:col-span-3"><WarehousePerformancePanel /></div>
      </div>
    </DashboardLayout>
  );
}
