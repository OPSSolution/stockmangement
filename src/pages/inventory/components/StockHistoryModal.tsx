import { useEffect, useState } from 'react';
import { Product } from '@/mocks/inventory';
import { StockHistoryEntry } from '@/mocks/stockHistory';
import { typeConfig } from './stockHistoryTypeConfig';
import { getReservationDetailsForProduct, type ReservationDetail } from '@/lib/stockReservations';

interface StockHistoryModalProps {
  product: Product;
  history: StockHistoryEntry[];
  onClose: () => void;
  /** Opens the Resolve On Hold flow — omitted when the viewer can't adjust stock. */
  onResolveOnHold?: () => void;
}

type HistoryFilter = 'all' | 'in' | 'out' | 'onhold';

const sourceIcon: Record<ReservationDetail['source'], string> = {
  Request: 'ri-file-list-3-line',
  Order: 'ri-shopping-bag-3-line',
  Transfer: 'ri-swap-box-line',
  Delivery: 'ri-truck-line',
};

// Matches both units going on hold ("On hold — ", from a damaged/defective return)
// and units coming back off hold ("On hold resolved — ", from ResolveOnHoldModal) —
// together these are the full on-hold lifecycle for this product.
const isOnHoldEntry = (h: StockHistoryEntry) => h.note?.startsWith('On hold — ') || h.note?.startsWith('On hold resolved — ');

export default function StockHistoryModal({ product, history, onClose, onResolveOnHold }: StockHistoryModalProps) {
  const productHistory = history.filter((h) => h.productId === product.id);
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [reservations, setReservations] = useState<ReservationDetail[]>([]);
  const [loadingReservations, setLoadingReservations] = useState(true);

  useEffect(() => {
    setLoadingReservations(true);
    getReservationDetailsForProduct(product.id).then((data) => {
      setReservations(data);
      setLoadingReservations(false);
    });
  }, [product.id]);

  const totalReserved = reservations.reduce((sum, r) => sum + r.quantity, 0);
  const onHoldStock = product.onHoldStock || 0;

  const filteredHistory = productHistory.filter((h) => {
    if (filter === 'in') return h.quantity > 0;
    if (filter === 'out') return h.quantity < 0;
    if (filter === 'onhold') return isOnHoldEntry(h);
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-3xl mx-4 shadow-xl h-[88vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-base font-bold text-gray-900">Stock History</h2>
            <p className="text-xs text-gray-400 mt-0.5">{product.name} · {product.sku}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 cursor-pointer">
            <i className="ri-close-line text-lg"></i>
          </button>
        </div>

        {/* Stats summary — click a card to filter the history list below to just that data */}
        <div className="grid grid-cols-5 gap-0 border-b border-gray-100 shrink-0">
          {[
            { label: 'Current Stock', value: String(product.stock), icon: 'ri-stack-line', color: 'text-gray-800', filter: 'all' as HistoryFilter },
            {
              label: 'Total In',
              value: `+${productHistory.filter(h => h.quantity > 0).reduce((s, h) => s + h.quantity, 0)}`,
              icon: 'ri-arrow-down-circle-line',
              color: 'text-emerald-600',
              filter: 'in' as HistoryFilter,
            },
            {
              label: 'Total Out',
              value: `${productHistory.filter(h => h.quantity < 0).reduce((s, h) => s + h.quantity, 0)}`,
              icon: 'ri-arrow-up-circle-line',
              color: 'text-rose-600',
              filter: 'out' as HistoryFilter,
            },
            {
              label: 'Reserved',
              value: loadingReservations ? '…' : String(totalReserved),
              icon: 'ri-time-line',
              color: totalReserved > 0 ? 'text-amber-600' : 'text-gray-400',
            },
            {
              label: 'On Hold',
              value: String(onHoldStock),
              icon: 'ri-forbid-2-line',
              color: onHoldStock > 0 ? 'text-orange-600' : 'text-gray-400',
              filter: 'onhold' as HistoryFilter,
            },
          ].map((stat) => {
            const isActive = !!stat.filter && filter === stat.filter;
            return (
              <div
                key={stat.label}
                onClick={stat.filter ? () => setFilter(filter === stat.filter ? 'all' : stat.filter!) : undefined}
                className={`relative flex flex-col items-center py-4 border-r border-gray-100 last:border-r-0 ${stat.filter ? 'cursor-pointer hover:bg-gray-50 transition-colors' : ''} ${isActive ? 'bg-gray-50' : ''}`}
                title={stat.filter ? 'Click to filter history below' : undefined}
              >
                {stat.filter && (
                  <i className={`ri-filter-3-fill absolute top-1.5 right-1.5 text-[11px] ${isActive ? 'text-gray-500' : 'text-gray-300'}`}></i>
                )}
                <div className={`w-5 h-5 flex items-center justify-center mb-1`}>
                  <i className={`${stat.icon} ${stat.color} text-base`}></i>
                </div>
                <p className={`text-lg font-bold ${stat.color}`}>{stat.value}</p>
                <p className={`text-xs ${isActive ? 'text-gray-700 font-medium' : 'text-gray-400'}`}>{stat.label}</p>
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-gray-400 text-center py-1.5 border-b border-gray-100 shrink-0 flex items-center justify-center gap-1">
          <i className="ri-cursor-line"></i>
          Click a card above to filter the history below
        </p>

        {/* Reserved breakdown — what's holding stock aside, not yet physically deducted */}
        {!loadingReservations && reservations.length > 0 && (
          <div className="px-6 py-3 border-b border-gray-100 bg-amber-50/50 shrink-0">
            <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <i className="ri-error-warning-line"></i>
              {totalReserved} unit{totalReserved === 1 ? '' : 's'} unavailable — tied up, not yet deducted
            </p>
            <div className="space-y-1">
              {reservations.map((r) => (
                <div key={`${r.source}-${r.id}`} className="flex items-center justify-between text-sm py-1">
                  <span className="flex items-center gap-1.5 text-gray-700 min-w-0">
                    <i className={`${sourceIcon[r.source]} text-gray-400 shrink-0`}></i>
                    <span className="truncate">{r.source} <span className="font-mono text-xs text-gray-400">{r.id}</span></span>
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-white border border-amber-200 text-amber-700 capitalize">
                      {r.status.replace('_', ' ')}
                    </span>
                    <span className="text-xs font-bold text-amber-700">{r.quantity} units</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* History list — filtered by the stat card clicked above, if any */}
        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-2">
          {filter !== 'all' && (
            <div className="flex items-center justify-between pb-1">
              <p className="text-xs text-gray-500">
                Showing {filter === 'in' ? 'stock in' : filter === 'out' ? 'stock out' : 'on hold'} entries only
              </p>
              <button onClick={() => setFilter('all')} className="text-xs text-emerald-600 hover:underline cursor-pointer">
                Show all
              </button>
            </div>
          )}
          {filter === 'onhold' && onHoldStock > 0 && onResolveOnHold && (
            <button
              onClick={onResolveOnHold}
              className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 mb-1 rounded-lg bg-orange-50 text-orange-700 hover:bg-orange-100 transition-colors cursor-pointer"
            >
              <i className="ri-checkbox-multiple-line"></i>
              Resolve On Hold Stock ({onHoldStock} unit{onHoldStock === 1 ? '' : 's'})
            </button>
          )}
          {filteredHistory.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <div className="w-10 h-10 flex items-center justify-center mb-3">
                <i className="ri-history-line text-3xl"></i>
              </div>
              <p className="text-sm">No history available for this product.</p>
            </div>
          ) : (
            filteredHistory.map((entry) => {
              const cfg = typeConfig[entry.type] ?? typeConfig.adjustment;
              return (
                <div key={entry.id} className="flex items-start gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors">
                  <div className={`w-8 h-8 rounded-lg ${cfg.bg} flex items-center justify-center shrink-0 mt-0.5`}>
                    <i className={`${cfg.icon} ${cfg.color} text-sm`}></i>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-semibold ${cfg.color}`}>{cfg.label}</span>
                      <span className={`text-sm font-bold ${entry.quantity > 0 ? 'text-emerald-600' : entry.quantity < 0 ? 'text-rose-600' : 'text-gray-400'}`}>
                        {entry.quantity > 0 ? '+' : ''}{entry.quantity}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 mt-0.5 leading-tight">{entry.note}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-gray-400">{entry.timestamp}</span>
                      <span className="text-xs text-gray-300">·</span>
                      <span className="text-xs text-gray-400">Ref: {entry.reference}</span>
                      <span className="text-xs text-gray-300">·</span>
                      <span className="text-xs text-gray-400">{entry.user}</span>
                    </div>
                    <div className="flex items-center gap-1 mt-1">
                      <span className="text-xs text-gray-400">{entry.stockBefore}</span>
                      <div className="w-3 h-3 flex items-center justify-center">
                        <i className="ri-arrow-right-line text-gray-300 text-xs"></i>
                      </div>
                      <span className="text-xs font-semibold text-gray-600">{entry.stockAfter} units</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 shrink-0">
          <button onClick={onClose} className="w-full py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer whitespace-nowrap">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}