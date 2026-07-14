import { useMemo, useState } from 'react';
import { Product } from '@/mocks/inventory';
import { StockHistoryEntry } from '@/mocks/stockHistory';
import { typeConfig } from './stockHistoryTypeConfig';

interface StockActivityReportModalProps {
  products: Product[];
  history: StockHistoryEntry[];
  warehouses: string[];
  onClose: () => void;
}

type Period = 'this_month' | 'last_month' | 'this_week' | 'all' | 'custom';
type Tab = 'by_product' | 'ledger';

function formatDateTime(ts: string) {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return ts;
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function csvEscape(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

export default function StockActivityReportModal({ products, history, warehouses, onClose }: StockActivityReportModalProps) {
  const [tab, setTab] = useState<Tab>('by_product');
  const [period, setPeriod] = useState<Period>('this_month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [filterWarehouse, setFilterWarehouse] = useState('all');
  const [filterType, setFilterType] = useState<'all' | StockHistoryEntry['type']>('all');
  const [search, setSearch] = useState('');

  const productMap = useMemo(() => {
    const map = new Map<string, Product>();
    products.forEach((p) => map.set(p.id, p));
    return map;
  }, [products]);

  const periodLabel = useMemo(() => {
    const now = new Date();
    if (period === 'this_month') return now.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    if (period === 'last_month') return new Date(now.getFullYear(), now.getMonth() - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
    if (period === 'this_week') return 'Last 7 days';
    if (period === 'custom') return customStart && customEnd ? `${customStart} → ${customEnd}` : 'Custom range';
    return 'All time';
  }, [period, customStart, customEnd]);

  const filtered = useMemo(() => {
    const now = new Date();
    return history.filter((h) => {
      const d = new Date(h.timestamp);

      let inPeriod = true;
      if (period === 'this_week') {
        const cutoff = new Date(now);
        cutoff.setDate(now.getDate() - 7);
        inPeriod = d >= cutoff;
      } else if (period === 'this_month') {
        inPeriod = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      } else if (period === 'last_month') {
        const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        inPeriod = d.getFullYear() === lm.getFullYear() && d.getMonth() === lm.getMonth();
      } else if (period === 'custom' && customStart && customEnd) {
        const start = new Date(customStart);
        const end = new Date(customEnd);
        end.setHours(23, 59, 59, 999);
        inPeriod = d >= start && d <= end;
      }
      if (!inPeriod) return false;

      if (filterWarehouse !== 'all' && h.warehouse !== filterWarehouse) return false;
      if (filterType !== 'all' && h.type !== filterType) return false;

      if (search.trim()) {
        const p = productMap.get(h.productId);
        const haystack = `${p?.name ?? ''} ${p?.sku ?? ''} ${h.productId}`.toLowerCase();
        if (!haystack.includes(search.trim().toLowerCase())) return false;
      }

      return true;
    });
  }, [history, period, customStart, customEnd, filterWarehouse, filterType, search, productMap]);

  const totals = useMemo(() => {
    const added = filtered.filter((h) => h.quantity > 0).reduce((s, h) => s + h.quantity, 0);
    const removed = filtered.filter((h) => h.quantity < 0).reduce((s, h) => s + Math.abs(h.quantity), 0);
    return { added, removed, net: added - removed, movements: filtered.length };
  }, [filtered]);

  const byProduct = useMemo(() => {
    const map = new Map<string, { productId: string; warehouse: string; added: number; removed: number; movements: number; lastActivity: string }>();
    filtered.forEach((h) => {
      const existing = map.get(h.productId);
      if (!existing) {
        map.set(h.productId, {
          productId: h.productId,
          warehouse: h.warehouse,
          added: h.quantity > 0 ? h.quantity : 0,
          removed: h.quantity < 0 ? Math.abs(h.quantity) : 0,
          movements: 1,
          lastActivity: h.timestamp,
        });
      } else {
        if (h.quantity > 0) existing.added += h.quantity;
        else existing.removed += Math.abs(h.quantity);
        existing.movements += 1;
        if (new Date(h.timestamp) > new Date(existing.lastActivity)) existing.lastActivity = h.timestamp;
      }
    });
    return Array.from(map.values()).sort((a, b) => (b.added + b.removed) - (a.added + a.removed));
  }, [filtered]);

  const exportCsv = () => {
    const rows = [['Date', 'Product', 'SKU', 'Type', 'Warehouse', 'Quantity', 'Stock Before', 'Stock After', 'Reference', 'User', 'Note']];
    filtered.forEach((h) => {
      const p = productMap.get(h.productId);
      rows.push([
        formatDateTime(h.timestamp),
        p?.name ?? h.productId,
        p?.sku ?? '',
        typeConfig[h.type]?.label ?? h.type,
        h.warehouse,
        String(h.quantity),
        String(h.stockBefore),
        String(h.stockAfter),
        h.reference,
        h.user,
        h.note,
      ]);
    });
    const csv = rows.map((r) => r.map((field) => csvEscape(field)).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stock-activity-${period}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl w-full max-w-5xl shadow-xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-base font-bold text-gray-900">Stock Activity Report</h2>
            <p className="text-xs text-gray-400 mt-0.5">Every stock movement across products · {periodLabel}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={exportCsv}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer whitespace-nowrap"
            >
              <i className="ri-download-2-line"></i> Export CSV
            </button>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 cursor-pointer">
              <i className="ri-close-line text-lg"></i>
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 px-6 py-3 border-b border-gray-100 shrink-0">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as Period)}
            className="py-1.5 px-2.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200 cursor-pointer text-gray-600"
          >
            <option value="this_month">This Month</option>
            <option value="last_month">Last Month</option>
            <option value="this_week">Last 7 Days</option>
            <option value="all">All Time</option>
            <option value="custom">Custom Range</option>
          </select>

          {period === 'custom' && (
            <>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="py-1.5 px-2.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200 text-gray-600"
              />
              <span className="text-xs text-gray-300">to</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="py-1.5 px-2.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200 text-gray-600"
              />
            </>
          )}

          {warehouses.length > 1 && (
            <select
              value={filterWarehouse}
              onChange={(e) => setFilterWarehouse(e.target.value)}
              className="py-1.5 px-2.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200 cursor-pointer text-gray-600"
            >
              <option value="all">All Warehouses</option>
              {warehouses.map((w) => <option key={w} value={w}>{w}</option>)}
            </select>
          )}

          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as typeof filterType)}
            className="py-1.5 px-2.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200 cursor-pointer text-gray-600"
          >
            <option value="all">All Types</option>
            {Object.entries(typeConfig).map(([key, cfg]) => <option key={key} value={key}>{cfg.label}</option>)}
          </select>

          <div className="relative ml-auto">
            <div className="w-4 h-4 flex items-center justify-center absolute left-2.5 top-1/2 -translate-y-1/2">
              <i className="ri-search-line text-gray-400 text-xs"></i>
            </div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search product or SKU..."
              className="pl-8 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg w-48 focus:outline-none focus:ring-2 focus:ring-emerald-200"
            />
          </div>
        </div>

        {/* Stats summary */}
        <div className="grid grid-cols-4 gap-0 border-b border-gray-100 shrink-0">
          {[
            { label: 'Movements', value: String(totals.movements), icon: 'ri-swap-line', color: 'text-gray-800' },
            { label: 'Total Added', value: `+${totals.added}`, icon: 'ri-arrow-down-circle-line', color: 'text-emerald-600' },
            { label: 'Total Removed', value: `-${totals.removed}`, icon: 'ri-arrow-up-circle-line', color: 'text-rose-600' },
            { label: 'Net Change', value: `${totals.net > 0 ? '+' : ''}${totals.net}`, icon: 'ri-scales-3-line', color: totals.net >= 0 ? 'text-emerald-600' : 'text-rose-600' },
          ].map((stat) => (
            <div key={stat.label} className="flex flex-col items-center py-4 border-r border-gray-100 last:border-r-0">
              <div className="w-5 h-5 flex items-center justify-center mb-1">
                <i className={`${stat.icon} ${stat.color} text-base`}></i>
              </div>
              <p className={`text-lg font-bold ${stat.color}`}>{stat.value}</p>
              <p className="text-xs text-gray-400">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 px-6 pt-3 shrink-0">
          {([
            { key: 'by_product', label: 'By Product' },
            { key: 'ledger', label: 'Full Ledger' },
          ] as { key: Tab; label: string }[]).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap ${
                tab === t.key ? 'bg-emerald-50 text-emerald-700' : 'text-gray-400 hover:bg-gray-50'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-4">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <div className="w-10 h-10 flex items-center justify-center mb-3">
                <i className="ri-history-line text-3xl"></i>
              </div>
              <p className="text-sm">No stock activity in this period.</p>
            </div>
          ) : tab === 'by_product' ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400">
                  <th className="font-medium pb-2">Product</th>
                  <th className="font-medium pb-2">Warehouse</th>
                  <th className="font-medium pb-2 text-right">Added</th>
                  <th className="font-medium pb-2 text-right">Removed</th>
                  <th className="font-medium pb-2 text-right">Net</th>
                  <th className="font-medium pb-2 text-right">Movements</th>
                  <th className="font-medium pb-2 text-right">Last Activity</th>
                </tr>
              </thead>
              <tbody>
                {byProduct.map((row) => {
                  const p = productMap.get(row.productId);
                  const net = row.added - row.removed;
                  return (
                    <tr
                      key={row.productId}
                      onClick={() => { setSearch(p?.sku ?? row.productId); setTab('ledger'); }}
                      className="border-t border-gray-50 hover:bg-gray-50 cursor-pointer"
                    >
                      <td className="py-2.5">
                        <p className="font-medium text-gray-800">{p?.name ?? row.productId}</p>
                        <p className="text-xs text-gray-400">{p?.sku ?? '—'}</p>
                      </td>
                      <td className="py-2.5 text-gray-600">{row.warehouse}</td>
                      <td className="py-2.5 text-right text-emerald-600 font-medium">+{row.added}</td>
                      <td className="py-2.5 text-right text-rose-600 font-medium">-{row.removed}</td>
                      <td className={`py-2.5 text-right font-semibold ${net > 0 ? 'text-emerald-600' : net < 0 ? 'text-rose-600' : 'text-gray-400'}`}>
                        {net > 0 ? '+' : ''}{net}
                      </td>
                      <td className="py-2.5 text-right text-gray-500">{row.movements}</td>
                      <td className="py-2.5 text-right text-gray-400 text-xs">{formatDateTime(row.lastActivity)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="space-y-2">
              {filtered.map((entry) => {
                const cfg = typeConfig[entry.type] ?? typeConfig.adjustment;
                const p = productMap.get(entry.productId);
                return (
                  <div key={entry.id} className="flex items-start gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors">
                    <div className={`w-8 h-8 rounded-lg ${cfg.bg} flex items-center justify-center shrink-0 mt-0.5`}>
                      <i className={`${cfg.icon} ${cfg.color} text-sm`}></i>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold text-gray-800 truncate">{p?.name ?? entry.productId}</span>
                        <span className={`text-sm font-bold shrink-0 ${entry.quantity > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {entry.quantity > 0 ? '+' : ''}{entry.quantity}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        <span className={`text-xs font-semibold ${cfg.color}`}>{cfg.label}</span>
                        <span className="text-xs text-gray-300">·</span>
                        <span className="text-xs text-gray-400">{entry.warehouse}</span>
                        <span className="text-xs text-gray-300">·</span>
                        <span className="text-xs text-gray-400">{formatDateTime(entry.timestamp)}</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1 leading-tight">{entry.note}</p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-gray-400">Ref: {entry.reference}</span>
                        <span className="text-xs text-gray-300">·</span>
                        <span className="text-xs text-gray-400">{entry.user}</span>
                        <span className="text-xs text-gray-300">·</span>
                        <span className="text-xs text-gray-400">{entry.stockBefore} → {entry.stockAfter} units</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
