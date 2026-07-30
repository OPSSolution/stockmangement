import { useMemo, useState } from 'react';
import { ProductStockRow } from '@/mocks/inventory';
import { StockHistoryEntry } from '@/mocks/stockHistory';
import { typeConfig } from './stockHistoryTypeConfig';
import { downloadPdf, type PdfCell } from '@/lib/exportPdf';
import { binStockKey } from '@/lib/binStock';

interface StockActivityReportModalProps {
  products: ProductStockRow[];
  history: StockHistoryEntry[];
  warehouses: string[];
  onClose: () => void;
}

type Tab = 'movement' | 'ledger';

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

// The canonical a–h line items from the Stock Movement Report spec, in report order.
// "Internal Request" isn't part of that spec but is a real movement type this app
// tracks (stock leaving for an internal Stock Request) — it's appended only when a
// product actually has some, so Beginning + movements always reconciles to Closing.
const MOVEMENT_TYPE_ORDER: StockHistoryEntry['type'][] = ['purchase', 'transfer_in', 'return', 'sale', 'transfer_out', 'adjustment', 'request'];

const MOVEMENT_LABELS: Partial<Record<StockHistoryEntry['type'], string>> = {
  purchase: 'Receive',
  transfer_in: 'Transfer-In',
  return: 'Return',
  // Labeled "Order" rather than "Sale" — the underlying type is still 'sale' in the
  // database (unchanged, since it's a fixed value in stock_history's CHECK constraint),
  // but the only place that ever writes it is Orders being fulfilled (OrderDetailModal),
  // so "Order" is what this column actually represents.
  sale: 'Order',
  transfer_out: 'Transfer-Out',
  adjustment: 'Adjustment (In/Out)',
  request: 'Internal Request',
};

function movementLabel(type: string) {
  return MOVEMENT_LABELS[type as StockHistoryEntry['type']] ?? typeConfig[type]?.label ?? type;
}

interface MovementRow {
  key: string;
  productName: string;
  sku: string;
  warehouse: string;
  typeTotals: Partial<Record<StockHistoryEntry['type'], number>>;
  beginning: number;
  closing: number;
  movements: number;
}

export default function StockActivityReportModal({ products, history, warehouses, onClose }: StockActivityReportModalProps) {
  const [tab, setTab] = useState<Tab>('movement');
  const [dateFrom, setDateFrom] = useState(() => toInputDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [dateTo, setDateTo] = useState(() => toInputDate(new Date()));
  const [filterWarehouse, setFilterWarehouse] = useState('all');
  const [consolidateWarehouses, setConsolidateWarehouses] = useState(false);
  const [filterType, setFilterType] = useState<'all' | StockHistoryEntry['type']>('all');
  const [search, setSearch] = useState('');

  const periodLabel = useMemo(() => {
    if (!dateFrom && !dateTo) return 'All time';
    if (dateFrom && dateTo) return `${formatDateShort(dateFrom)} – ${formatDateShort(dateTo)}`;
    if (dateFrom) return `From ${formatDateShort(dateFrom)}`;
    return `Through ${formatDateShort(dateTo)}`;
  }, [dateFrom, dateTo]);

  const periodStart = useMemo(() => (dateFrom ? new Date(dateFrom) : null), [dateFrom]);
  const periodEnd = useMemo(() => {
    if (!dateTo) return null;
    const d = new Date(dateTo);
    d.setHours(23, 59, 59, 999);
    return d;
  }, [dateTo]);

  // Every entry for one product's stock at one warehouse, oldest first — the backward
  // calculation below needs the *full* trail (not just what falls inside the chosen
  // dates) to rewind from that warehouse's current stock back to its balance at the
  // start/end of the period. Keyed per (product, warehouse) rather than just product,
  // since a product can now have independent history at more than one warehouse —
  // grouping by product id alone would blend two warehouses' movements into one total.
  const historyByRow = useMemo(() => {
    const map = new Map<string, StockHistoryEntry[]>();
    history.forEach((h) => {
      const key = binStockKey(h.productId, h.warehouse);
      const list = map.get(key);
      if (list) list.push(h); else map.set(key, [h]);
    });
    map.forEach((list) => list.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()));
    return map;
  }, [history]);

  // One row per product (or per SKU when consolidating across warehouses). Beginning/
  // Closing are rewound from the product's live stock: Closing = current stock minus
  // everything that happened after the period; Beginning = Closing minus everything
  // that happened during the period. A product with zero movement in the window still
  // gets a correct (unchanged) balance instead of just being dropped from the report.
  const movementRows = useMemo((): MovementRow[] => {
    const scopeProducts = products.filter((p) => {
      if (filterWarehouse !== 'all' && p.warehouse !== filterWarehouse) return false;
      if (search.trim()) {
        const haystack = `${p.name} ${p.sku}`.toLowerCase();
        if (!haystack.includes(search.trim().toLowerCase())) return false;
      }
      return true;
    });

    const perProduct = scopeProducts.map((p) => {
      const entries = historyByRow.get(binStockKey(p.id, p.warehouse)) ?? [];
      const afterPeriod = periodEnd ? entries.filter((h) => new Date(h.timestamp) > periodEnd) : [];
      const inPeriod = entries.filter((h) => {
        const t = new Date(h.timestamp);
        if (periodStart && t < periodStart) return false;
        if (periodEnd && t > periodEnd) return false;
        return true;
      });
      const closing = p.stock - afterPeriod.reduce((s, h) => s + h.quantity, 0);
      const beginning = closing - inPeriod.reduce((s, h) => s + h.quantity, 0);
      const typeTotals: Partial<Record<StockHistoryEntry['type'], number>> = {};
      inPeriod.forEach((h) => { typeTotals[h.type] = (typeTotals[h.type] ?? 0) + h.quantity; });
      return { productId: p.id, productName: p.name, sku: p.sku, warehouse: p.warehouse, beginning, closing, typeTotals, movements: inPeriod.length };
    });

    if (!consolidateWarehouses || filterWarehouse !== 'all') {
      return perProduct.map((r) => ({ key: `${r.productId}::${r.warehouse}`, productName: r.productName, sku: r.sku, warehouse: r.warehouse, typeTotals: r.typeTotals, beginning: r.beginning, closing: r.closing, movements: r.movements }));
    }

    // Consolidated: merge every warehouse's row for the same product into one combined
    // line — grouped by product id directly now that a product id genuinely represents
    // one item (no more duplicate-SKU rows to reconcile the way there used to be).
    const byProductId = new Map<string, MovementRow>();
    perProduct.forEach((r) => {
      const existing = byProductId.get(r.productId);
      if (!existing) {
        byProductId.set(r.productId, { key: r.productId, productName: r.productName, sku: r.sku, warehouse: 'All Warehouses', typeTotals: { ...r.typeTotals }, beginning: r.beginning, closing: r.closing, movements: r.movements });
        return;
      }
      existing.beginning += r.beginning;
      existing.closing += r.closing;
      existing.movements += r.movements;
      MOVEMENT_TYPE_ORDER.forEach((t) => {
        const v = r.typeTotals[t];
        if (v) existing.typeTotals[t] = (existing.typeTotals[t] ?? 0) + v;
      });
    });
    return Array.from(byProductId.values()).sort((a, b) => a.productName.localeCompare(b.productName));
  }, [products, historyByRow, filterWarehouse, consolidateWarehouses, search, periodStart, periodEnd]);

  // Always show every movement-type column, even ones with no activity in the
  // current scope/period — a stable set of columns is what makes the report
  // comparable across different date ranges and filters.
  const activeMovementTypes = MOVEMENT_TYPE_ORDER;

  const movementTotals = useMemo(() => {
    const totals: Partial<Record<StockHistoryEntry['type'], number>> & { beginning: number; closing: number } = { beginning: 0, closing: 0 };
    movementRows.forEach((r) => {
      totals.beginning += r.beginning;
      totals.closing += r.closing;
      activeMovementTypes.forEach((t) => { totals[t] = (totals[t] ?? 0) + (r.typeTotals[t] ?? 0); });
    });
    return totals;
  }, [movementRows, activeMovementTypes]);

  // Raw ledger — every individual entry, independent of the movement rewind above.
  const ledgerEntries = useMemo(() => {
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
        const p = products.find((prod) => prod.id === h.productId);
        const haystack = `${p?.name ?? ''} ${p?.sku ?? ''} ${h.productId}`.toLowerCase();
        if (!haystack.includes(search.trim().toLowerCase())) return false;
      }
      return true;
    });
  }, [history, dateFrom, dateTo, filterWarehouse, filterType, search, products]);

  const exportMovementCsv = () => {
    const header = ['Product', 'SKU', 'Warehouse', 'Beginning Stock', ...activeMovementTypes.map(movementLabel), 'Closing Stock'];
    const rows = [header];
    movementRows.forEach((r) => {
      rows.push([
        r.productName, r.sku, r.warehouse, String(r.beginning),
        ...activeMovementTypes.map((t) => String(r.typeTotals[t] ?? 0)),
        String(r.closing),
      ]);
    });
    rows.push(['TOTAL', '', '', String(movementTotals.beginning), ...activeMovementTypes.map((t) => String(movementTotals[t] ?? 0)), String(movementTotals.closing)]);
    const csv = rows.map((r) => r.map((field) => csvEscape(field)).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stock-movement-${dateFrom || 'all'}-to-${dateTo || 'all'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportLedgerCsv = () => {
    const rows = [['Date', 'Product', 'SKU', 'Type', 'Warehouse', 'Quantity', 'Stock Before', 'Stock After', 'Reference', 'User', 'Note']];
    ledgerEntries.forEach((h) => {
      const p = products.find((prod) => prod.id === h.productId);
      rows.push([
        formatDateTime(h.timestamp),
        p?.name ?? h.productId,
        p?.sku ?? '',
        movementLabel(h.type),
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
    a.download = `stock-ledger-${dateFrom || 'all'}-to-${dateTo || 'all'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const scopeLabel = filterWarehouse === 'all'
    ? (consolidateWarehouses ? 'All Warehouses (consolidated by SKU)' : 'All Warehouses')
    : filterWarehouse;

  const handleDownloadPdf = () => {
    const head = ['Product', 'SKU', 'Warehouse', 'Beg.', ...activeMovementTypes.map(movementLabel), 'Closing'];
    const rows = movementRows.map((r) => [
      r.productName,
      r.sku,
      r.warehouse,
      r.beginning,
      ...activeMovementTypes.map((t) => r.typeTotals[t] ?? 0),
      r.closing,
    ]);
    const numericColStart = 3;
    const numericColCount = 2 + activeMovementTypes.length;
    const colStyles = Object.fromEntries(
      Array.from({ length: numericColCount }, (_, i) => [numericColStart + i, { halign: 'right' as const }])
    );
    const footRow: PdfCell[] = [
      { content: 'TOTAL', colSpan: 3, styles: { halign: 'right' } },
      movementTotals.beginning,
      ...activeMovementTypes.map((t) => movementTotals[t] ?? 0),
      movementTotals.closing,
    ];

    downloadPdf(
      {
        docType: 'Stock Movement Report',
        docId: `SMR-${dateFrom || 'start'}_${dateTo || 'now'}`,
        subtitle: `${scopeLabel} · ${periodLabel}`,
        infoBoxes: [
          {
            title: 'Period',
            rows: [
              { label: 'Range', value: periodLabel },
              { label: 'Scope', value: scopeLabel },
            ],
          },
          {
            title: 'Summary',
            rows: [
              { label: 'Products', value: String(movementRows.length) },
              { label: 'Total Beginning', value: String(movementTotals.beginning) },
              { label: 'Total Closing', value: String(movementTotals.closing) },
            ],
          },
        ],
        tables: [
          {
            title: 'Stock Movement by Product',
            head,
            rows,
            colStyles,
            footRow,
          },
        ],
        footerLeft: 'Stock Movement Report',
      },
      `stock-movement-report-${dateFrom || 'all'}-to-${dateTo || 'all'}.pdf`
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl w-full max-w-6xl shadow-xl h-[95vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-base font-bold text-gray-900">Stock Movement Report</h2>
            <p className="text-xs text-gray-400 mt-0.5">Beginning → Receive/Transfer/Return/Order/Adjustment → Closing · {periodLabel}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadPdf}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer whitespace-nowrap"
            >
              <i className="ri-printer-line"></i> Print / PDF
            </button>
            <button
              onClick={tab === 'movement' ? exportMovementCsv : exportLedgerCsv}
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

          {warehouses.length > 1 && filterWarehouse === 'all' && (
            <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer whitespace-nowrap">
              <input type="checkbox" checked={consolidateWarehouses} onChange={(e) => setConsolidateWarehouses(e.target.checked)} className="rounded" />
              Consolidate by SKU
            </label>
          )}

          {tab === 'ledger' && (
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as typeof filterType)}
              className="py-1.5 px-2.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200 cursor-pointer text-gray-600"
            >
              <option value="all">All Types</option>
              {MOVEMENT_TYPE_ORDER.map((t) => <option key={t} value={t}>{movementLabel(t)}</option>)}
            </select>
          )}

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

        {/* Stats summary — the a–h line items, totaled across every product in scope */}
        <div className="flex items-stretch gap-0 border-b border-gray-100 shrink-0 divide-x divide-gray-100 overflow-x-auto">
          <div className="flex-1 min-w-[84px] flex flex-col items-center justify-center py-4 px-2">
            <p className="text-lg font-bold text-gray-700">{movementTotals.beginning}</p>
            <p className="text-xs text-gray-400 whitespace-nowrap">Beginning</p>
          </div>
          {activeMovementTypes.map((t) => {
            const cfg = typeConfig[t] ?? typeConfig.adjustment;
            const total = movementTotals[t] ?? 0;
            return (
              <div key={t} className="flex-1 min-w-[84px] flex flex-col items-center justify-center py-4 px-2">
                <div className="w-5 h-5 flex items-center justify-center mb-1">
                  <i className={`${cfg.icon} ${cfg.color} text-base`}></i>
                </div>
                <p className={`text-lg font-bold ${cfg.color}`}>{total > 0 ? '+' : ''}{total}</p>
                <p className="text-xs text-gray-400 whitespace-nowrap">{movementLabel(t)}</p>
              </div>
            );
          })}
          <div className="flex-1 min-w-[84px] flex flex-col items-center justify-center py-4 px-2">
            <p className="text-lg font-bold text-gray-900">{movementTotals.closing}</p>
            <p className="text-xs text-gray-400 whitespace-nowrap">Closing</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 px-6 pt-3 shrink-0">
          {([
            { key: 'movement', label: 'Stock Movement' },
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
          {tab === 'movement' ? (
            movementRows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <div className="w-10 h-10 flex items-center justify-center mb-3">
                  <i className="ri-file-chart-line text-3xl"></i>
                </div>
                <p className="text-sm">No products in this scope.</p>
              </div>
            ) : (
              <table className="w-full text-sm border-separate border-spacing-0">
                <thead>
                  <tr className="text-left text-xs text-gray-400">
                    <th className="sticky top-0 z-10 bg-white font-medium pt-4 pb-2 pr-4 border-b border-gray-100">Product</th>
                    <th className="sticky top-0 z-10 bg-white font-medium pt-4 pb-2 px-4 border-b border-gray-100">Warehouse</th>
                    <th className="sticky top-0 z-10 bg-white font-medium pt-4 pb-2 px-4 text-right whitespace-nowrap border-b border-gray-100">Beginning</th>
                    {activeMovementTypes.map((t) => (
                      <th key={t} className="sticky top-0 z-10 bg-white font-medium pt-4 pb-2 px-4 text-right whitespace-nowrap border-b border-gray-100">{movementLabel(t)}</th>
                    ))}
                    <th className="sticky top-0 z-10 bg-white font-medium pt-4 pb-2 pl-5 pr-4 text-right border-l border-b border-gray-100 whitespace-nowrap">Closing</th>
                  </tr>
                </thead>
                <tbody>
                  {movementRows.map((row) => (
                    <tr
                      key={row.key}
                      onClick={() => { setSearch(row.sku); setTab('ledger'); }}
                      className="border-t border-gray-50 hover:bg-gray-50 cursor-pointer"
                    >
                      <td className="py-2.5 pr-4">
                        <p className="font-medium text-gray-800">{row.productName}</p>
                        <p className="text-xs text-gray-400">{row.sku}</p>
                      </td>
                      <td className="py-2.5 px-4 text-gray-600 whitespace-nowrap">{row.warehouse}</td>
                      <td className="py-2.5 px-4 text-right text-gray-700 whitespace-nowrap">{row.beginning}</td>
                      {activeMovementTypes.map((t) => {
                        const v = row.typeTotals[t];
                        return (
                          <td key={t} className={`py-2.5 px-4 text-right font-medium whitespace-nowrap ${!v ? 'text-gray-300' : v > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {v ? `${v > 0 ? '+' : ''}${v}` : '—'}
                          </td>
                        );
                      })}
                      <td className="py-2.5 pl-5 pr-4 text-right font-semibold text-gray-900 border-l border-gray-100 whitespace-nowrap">{row.closing}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-200">
                    <td className="py-2.5 pr-4 font-semibold text-gray-800">Total</td>
                    <td className="py-2.5 px-4"></td>
                    <td className="py-2.5 px-4 text-right font-semibold text-gray-800 whitespace-nowrap">{movementTotals.beginning}</td>
                    {activeMovementTypes.map((t) => {
                      const v = movementTotals[t] ?? 0;
                      return (
                        <td key={t} className={`py-2.5 px-4 text-right font-semibold whitespace-nowrap ${v === 0 ? 'text-gray-300' : v > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {v ? `${v > 0 ? '+' : ''}${v}` : '—'}
                        </td>
                      );
                    })}
                    <td className="py-2.5 pl-5 pr-4 text-right font-semibold text-gray-900 border-l border-gray-100 whitespace-nowrap">{movementTotals.closing}</td>
                  </tr>
                </tfoot>
              </table>
            )
          ) : ledgerEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <div className="w-10 h-10 flex items-center justify-center mb-3">
                <i className="ri-history-line text-3xl"></i>
              </div>
              <p className="text-sm">No stock activity in this period.</p>
            </div>
          ) : (
            <div className="space-y-2 pt-4">
              {ledgerEntries.map((entry) => {
                const cfg = typeConfig[entry.type] ?? typeConfig.adjustment;
                const p = products.find((prod) => prod.id === entry.productId);
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
                        <span className={`text-xs font-semibold ${cfg.color}`}>{movementLabel(entry.type)}</span>
                        <span className="text-xs text-gray-300">·</span>
                        <span className="text-xs text-gray-400">{entry.warehouse}</span>
                        {entry.binLocation && (
                          <>
                            <span className="text-xs text-gray-300">·</span>
                            <span className="text-xs text-gray-400 font-mono">Bin: {entry.binLocation}</span>
                          </>
                        )}
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
