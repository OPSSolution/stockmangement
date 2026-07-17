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

type Tab = 'by_product' | 'ledger';

function formatDateTime(ts: string) {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return ts;
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatDateShort(iso: string) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function toInputDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function csvEscape(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

const TYPE_ORDER: StockHistoryEntry['type'][] = ['transfer_in', 'transfer_out', 'purchase', 'sale', 'request', 'return', 'adjustment'];

const REPORT_LABEL_OVERRIDES: Partial<Record<StockHistoryEntry['type'], string>> = {
  purchase: 'Order',
  sale: 'Deliveries',
};

function reportLabel(type: StockHistoryEntry['type'] | string) {
  return REPORT_LABEL_OVERRIDES[type as StockHistoryEntry['type']] ?? typeConfig[type]?.label ?? type;
}

export default function StockActivityReportModal({ products, history, warehouses, onClose }: StockActivityReportModalProps) {
  const [tab, setTab] = useState<Tab>('by_product');
  const [dateFrom, setDateFrom] = useState(() => toInputDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [dateTo, setDateTo] = useState(() => toInputDate(new Date()));
  const [filterWarehouse, setFilterWarehouse] = useState('all');
  const [filterType, setFilterType] = useState<'all' | StockHistoryEntry['type']>('all');
  const [search, setSearch] = useState('');

  const productMap = useMemo(() => {
    const map = new Map<string, Product>();
    products.forEach((p) => map.set(p.id, p));
    return map;
  }, [products]);

  const periodLabel = useMemo(() => {
    if (!dateFrom && !dateTo) return 'All time';
    if (dateFrom && dateTo) return `${formatDateShort(dateFrom)} – ${formatDateShort(dateTo)}`;
    if (dateFrom) return `From ${formatDateShort(dateFrom)}`;
    return `Through ${formatDateShort(dateTo)}`;
  }, [dateFrom, dateTo]);

  const filtered = useMemo(() => {
    return history.filter((h) => {
      const d = new Date(h.timestamp);

      if (dateFrom && d < new Date(dateFrom)) return false;
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        if (d > end) return false;
      }

      if (filterWarehouse !== 'all' && h.warehouse !== filterWarehouse) return false;
      if (filterType !== 'all' && h.type !== filterType) return false;

      if (search.trim()) {
        const p = productMap.get(h.productId);
        const haystack = `${p?.name ?? ''} ${p?.sku ?? ''} ${h.productId}`.toLowerCase();
        if (!haystack.includes(search.trim().toLowerCase())) return false;
      }

      return true;
    });
  }, [history, dateFrom, dateTo, filterWarehouse, filterType, search, productMap]);

  const totals = useMemo(() => {
    const net = filtered.reduce((s, h) => s + h.quantity, 0);
    return { net, movements: filtered.length };
  }, [filtered]);

  const typeTotals = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach((h) => map.set(h.type, (map.get(h.type) ?? 0) + h.quantity));
    return TYPE_ORDER.filter((t) => map.has(t)).map((t) => ({ type: t, total: map.get(t)! }));
  }, [filtered]);

  const activeTypes = useMemo(() => typeTotals.map((t) => t.type), [typeTotals]);

  const cardsTotal = useMemo(
    () => typeTotals.filter((t) => t.type !== 'adjustment').reduce((s, t) => s + t.total, 0),
    [typeTotals]
  );

  const byProduct = useMemo(() => {
    const map = new Map<string, { productId: string; warehouse: string; typeTotals: Partial<Record<StockHistoryEntry['type'], number>>; movements: number; lastActivity: string; volume: number }>();
    filtered.forEach((h) => {
      let existing = map.get(h.productId);
      if (!existing) {
        existing = { productId: h.productId, warehouse: h.warehouse, typeTotals: {}, movements: 0, lastActivity: h.timestamp, volume: 0 };
        map.set(h.productId, existing);
      }
      existing.typeTotals[h.type] = (existing.typeTotals[h.type] ?? 0) + h.quantity;
      existing.movements += 1;
      existing.volume += Math.abs(h.quantity);
      if (new Date(h.timestamp) > new Date(existing.lastActivity)) existing.lastActivity = h.timestamp;
    });
    return Array.from(map.values()).sort((a, b) => b.volume - a.volume);
  }, [filtered]);

  const exportCsv = () => {
    const rows = [['Date', 'Product', 'SKU', 'Type', 'Warehouse', 'Quantity', 'Stock Before', 'Stock After', 'Reference', 'User', 'Note']];
    filtered.forEach((h) => {
      const p = productMap.get(h.productId);
      rows.push([
        formatDateTime(h.timestamp),
        p?.name ?? h.productId,
        p?.sku ?? '',
        reportLabel(h.type),
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
    a.download = `stock-activity-${dateFrom || 'all'}-to-${dateTo || 'all'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl w-full max-w-5xl shadow-xl h-[95vh] flex flex-col">
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
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="py-1.5 px-2.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200 text-gray-600"
          />
          <span className="text-xs text-gray-300">to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="py-1.5 px-2.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200 text-gray-600"
          />
          {(dateFrom || dateTo) && (
            <button
              onClick={() => { setDateFrom(''); setDateTo(''); }}
              className="text-xs text-gray-400 hover:text-gray-600 cursor-pointer whitespace-nowrap"
            >
              Clear dates
            </button>
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
            {Object.keys(typeConfig).map((key) => <option key={key} value={key}>{reportLabel(key)}</option>)}
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
        <div className="flex items-stretch gap-0 border-b border-gray-100 shrink-0 divide-x divide-gray-100">
          {typeTotals.filter(({ type }) => type !== 'adjustment').map(({ type, total }) => {
            const cfg = typeConfig[type] ?? typeConfig.adjustment;
            return (
              <div key={type} className="flex-1 min-w-0 flex flex-col items-center justify-center py-4 px-2">
                <div className="w-5 h-5 flex items-center justify-center mb-1">
                  <i className={`${cfg.icon} ${cfg.color} text-base`}></i>
                </div>
                <p className={`text-lg font-bold ${cfg.color}`}>{total > 0 ? '+' : ''}{total}</p>
                <p className="text-xs text-gray-400">{reportLabel(type)}</p>
              </div>
            );
          })}

          <div className="flex-1 min-w-0 flex flex-col items-center justify-center py-4 px-2">
            <div className="w-5 h-5 flex items-center justify-center mb-1">
              <i className={`ri-scales-3-line text-base ${cardsTotal >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}></i>
            </div>
            <p className={`text-lg font-bold ${cardsTotal >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{cardsTotal > 0 ? '+' : ''}{cardsTotal}</p>
            <p className="text-xs text-gray-400">Total</p>
          </div>
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
        <div className="overflow-auto flex-1 px-6 pb-4">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <div className="w-10 h-10 flex items-center justify-center mb-3">
                <i className="ri-history-line text-3xl"></i>
              </div>
              <p className="text-sm">No stock activity in this period.</p>
            </div>
          ) : tab === 'by_product' ? (
            <div>
              <table className="w-full text-sm border-separate border-spacing-0">
                <thead>
                  <tr className="text-left text-xs text-gray-400">
                    <th className="sticky top-0 z-10 bg-white font-medium pt-4 pb-2 pr-4 border-b border-gray-100">Product</th>
                    <th className="sticky top-0 z-10 bg-white font-medium pt-4 pb-2 px-4 border-b border-gray-100">Warehouse</th>
                    {activeTypes.map((t) => (
                      <th key={t} className="sticky top-0 z-10 bg-white font-medium pt-4 pb-2 px-4 text-right whitespace-nowrap border-b border-gray-100">{reportLabel(t)}</th>
                    ))}
                    <th className="sticky top-0 z-10 bg-white font-medium pt-4 pb-2 pl-5 pr-4 text-right border-l border-b border-gray-100 whitespace-nowrap">Total</th>
                    <th className="sticky top-0 z-10 bg-white font-medium pt-4 pb-2 pl-4 text-right whitespace-nowrap border-b border-gray-100">Last Activity</th>
                  </tr>
                </thead>
                <tbody>
                  {byProduct.map((row) => {
                    const p = productMap.get(row.productId);
                    const rowTotal = Object.values(row.typeTotals).reduce((s, v) => s + (v ?? 0), 0);
                    return (
                      <tr
                        key={row.productId}
                        onClick={() => { setSearch(p?.sku ?? row.productId); setTab('ledger'); }}
                        className="border-t border-gray-50 hover:bg-gray-50 cursor-pointer"
                      >
                        <td className="py-2.5 pr-4">
                          <p className="font-medium text-gray-800">{p?.name ?? row.productId}</p>
                          <p className="text-xs text-gray-400">{p?.sku ?? '—'}</p>
                        </td>
                        <td className="py-2.5 px-4 text-gray-600 whitespace-nowrap">{row.warehouse}</td>
                        {activeTypes.map((t) => {
                          const v = row.typeTotals[t];
                          return (
                            <td key={t} className={`py-2.5 px-4 text-right font-medium whitespace-nowrap ${!v ? 'text-gray-300' : v > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {v ? `${v > 0 ? '+' : ''}${v}` : '—'}
                            </td>
                          );
                        })}
                        <td className={`py-2.5 pl-5 pr-4 text-right font-semibold border-l border-gray-100 whitespace-nowrap ${rowTotal === 0 ? 'text-gray-400' : rowTotal > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {rowTotal > 0 ? '+' : ''}{rowTotal}
                        </td>
                        <td className="py-2.5 pl-4 text-right text-gray-400 text-xs whitespace-nowrap">{formatDateTime(row.lastActivity)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-200">
                    <td className="py-2.5 pr-4 font-semibold text-gray-800">Total</td>
                    <td className="py-2.5 px-4"></td>
                    {activeTypes.map((t) => {
                      const v = typeTotals.find((tt) => tt.type === t)?.total ?? 0;
                      return (
                        <td key={t} className={`py-2.5 px-4 text-right font-semibold whitespace-nowrap ${v === 0 ? 'text-gray-300' : v > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {v ? `${v > 0 ? '+' : ''}${v}` : '—'}
                        </td>
                      );
                    })}
                    <td className={`py-2.5 pl-5 pr-4 text-right font-semibold border-l border-gray-100 whitespace-nowrap ${totals.net === 0 ? 'text-gray-400' : totals.net > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {totals.net > 0 ? '+' : ''}{totals.net}
                    </td>
                    <td className="py-2.5 pl-4"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <div className="space-y-2 pt-4">
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
                        <span className={`text-xs font-semibold ${cfg.color}`}>{reportLabel(entry.type)}</span>
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
