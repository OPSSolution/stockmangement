import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { products } from '@/mocks/inventory';
import { orders } from '@/mocks/orders';
import { returnRequests } from '@/mocks/returns';
import { transfers } from '@/mocks/transfers';
import { purchaseOrders } from '@/mocks/purchases';
import { vendors } from '@/mocks/vendors';
import { formatUSD } from '@/lib/currency';

interface SearchResult {
  id: string;
  type: 'product' | 'order' | 'return' | 'transfer' | 'purchase' | 'vendor';
  title: string;
  subtitle: string;
  badge?: string;
  badgeColor?: string;
  path: string;
}

const typeConfig = {
  product: { icon: 'ri-archive-stack-line', color: 'text-emerald-600', bg: 'bg-emerald-50', label: 'Product' },
  order: { icon: 'ri-shopping-bag-3-line', color: 'text-sky-600', bg: 'bg-sky-50', label: 'Order' },
  return: { icon: 'ri-arrow-go-back-line', color: 'text-amber-600', bg: 'bg-amber-50', label: 'Return' },
  transfer: { icon: 'ri-swap-box-line', color: 'text-violet-600', bg: 'bg-violet-50', label: 'Transfer' },
  purchase: { icon: 'ri-shopping-cart-2-line', color: 'text-orange-600', bg: 'bg-orange-50', label: 'Purchase' },
  vendor: { icon: 'ri-store-2-line', color: 'text-teal-600', bg: 'bg-teal-50', label: 'Vendor' },
};

const searchIndex: SearchResult[] = (() => {
  const results: SearchResult[] = [];

  products.forEach((p) => {
    results.push({
      id: p.id,
      type: 'product',
      title: p.name,
      subtitle: `${p.sku} · ${p.warehouse} · ${p.stock} in stock`,
      badge: p.status === 'out_of_stock' ? 'Out of Stock' : p.status === 'low_stock' ? 'Low Stock' : 'In Stock',
      badgeColor: p.status === 'out_of_stock' ? 'text-red-600 bg-red-50' : p.status === 'low_stock' ? 'text-amber-600 bg-amber-50' : 'text-emerald-600 bg-emerald-50',
      path: '/inventory',
    });
  });

  orders.forEach((o) => {
    results.push({
      id: o.id,
      type: 'order',
      title: `${o.id} — ${o.customer}`,
      subtitle: `${o.city} · ${formatUSD(o.total)} · ${o.itemCount} items`,
      badge: o.status.charAt(0).toUpperCase() + o.status.slice(1),
      badgeColor: o.status === 'fulfilled' ? 'text-emerald-600 bg-emerald-50' : o.status === 'rejected' ? 'text-red-600 bg-red-50' : o.status === 'pending' ? 'text-amber-600 bg-amber-50' : 'text-sky-600 bg-sky-50',
      path: '/orders',
    });
  });

  returnRequests.forEach((r) => {
    results.push({
      id: r.id,
      type: 'return',
      title: `${r.id} — ${r.returnedBy}`,
      subtitle: `${r.requestId} · ${formatUSD(r.totalValue)} · ${r.items[0].productName}`,
      badge: r.status.charAt(0).toUpperCase() + r.status.slice(1),
      badgeColor: r.status === 'restocked' ? 'text-teal-600 bg-teal-50' : r.status === 'pending' ? 'text-amber-600 bg-amber-50' : 'text-gray-600 bg-gray-100',
      path: '/returns',
    });
  });

  transfers.forEach((t) => {
    results.push({
      id: t.id,
      type: 'transfer',
      title: `${t.id} — ${t.fromWarehouse} → ${t.toWarehouse}`,
      subtitle: `${t.totalItems} units · ${t.reason}`,
      badge: t.status.replace('_', ' '),
      badgeColor: t.status === 'received' ? 'text-emerald-600 bg-emerald-50' : t.status === 'in_transit' ? 'text-violet-600 bg-violet-50' : 'text-amber-600 bg-amber-50',
      path: '/transfers',
    });
  });

  purchaseOrders.forEach((p) => {
    results.push({
      id: p.id,
      type: 'purchase',
      title: `${p.id} — ${p.vendor}`,
      subtitle: `${p.items[0].productName} · ${formatUSD(p.total)}`,
      badge: p.status.charAt(0).toUpperCase() + p.status.slice(1),
      badgeColor: p.status === 'received' ? 'text-emerald-600 bg-emerald-50' : p.status === 'cancelled' ? 'text-red-600 bg-red-50' : 'text-sky-600 bg-sky-50',
      path: '/purchases',
    });
  });

  vendors.forEach((v) => {
    results.push({
      id: v.id,
      type: 'vendor',
      title: v.name,
      subtitle: `${v.city} · ${v.products.length} products · ${v.metrics.fulfillmentRate}% fulfillment`,
      badge: v.status.charAt(0).toUpperCase() + v.status.slice(1),
      badgeColor: v.status === 'active' ? 'text-emerald-600 bg-emerald-50' : 'text-gray-500 bg-gray-100',
      path: '/vendors',
    });
  });

  return results;
})();

interface MobileSearchOverlayProps {
  open: boolean;
  onClose: () => void;
}

export default function MobileSearchOverlay({ open, onClose }: MobileSearchOverlayProps) {
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const results = query.trim().length < 1
    ? []
    : searchIndex.filter((r) => {
        const q = query.toLowerCase();
        return (
          r.title.toLowerCase().includes(q) ||
          r.subtitle.toLowerCase().includes(q) ||
          r.id.toLowerCase().includes(q)
        );
      }).slice(0, 12);

  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    if (!acc[r.type]) acc[r.type] = [];
    acc[r.type].push(r);
    return acc;
  }, {});

  const flatResults = Object.values(grouped).flat();

  const handleSelect = useCallback((result: SearchResult) => {
    navigate(result.path);
    setQuery('');
    onClose();
  }, [navigate, onClose]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 100);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (flatResults.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setActiveIdx((i) => (i + 1) % flatResults.length);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setActiveIdx((i) => (i - 1 + flatResults.length) % flatResults.length);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          if (flatResults[activeIdx]) handleSelect(flatResults[activeIdx]);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, flatResults, activeIdx, onClose, handleSelect]);

  useEffect(() => { setActiveIdx(0); }, [query]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col sm:hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
        <div className="flex items-center flex-1 bg-gray-50 rounded-lg px-3 py-2.5">
          <i className="ri-search-line text-gray-400 text-base mr-2"></i>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); }}
            placeholder="Search products, orders, returns…"
            className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400 outline-none"
          />
          {query.length > 0 && (
            <button
              onClick={() => setQuery('')}
              className="w-6 h-6 flex items-center justify-center text-gray-400"
            >
              <i className="ri-close-circle-fill text-base"></i>
            </button>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-sm font-medium text-gray-500 px-1 whitespace-nowrap cursor-pointer"
        >
          Cancel
        </button>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {query.trim().length === 0 ? (
          <div className="px-4 py-8 text-center">
            <div className="w-14 h-14 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-3">
              <i className="ri-search-line text-gray-300 text-2xl"></i>
            </div>
            <p className="text-sm text-gray-400">Type to search across all modules</p>
            <div className="flex flex-wrap gap-2 justify-center mt-4">
              {['Headphones', 'Order #', 'Vendor', 'Transfer'].map((hint) => (
                <button
                  key={hint}
                  onClick={() => setQuery(hint)}
                  className="px-3 py-1.5 bg-gray-50 rounded-full text-xs text-gray-500 cursor-pointer"
                >
                  {hint}
                </button>
              ))}
            </div>
          </div>
        ) : results.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <i className="ri-search-line text-3xl text-gray-200 mb-3 block"></i>
            <p className="text-sm text-gray-400">
              No results for &ldquo;<span className="font-medium text-gray-600">{query}</span>&rdquo;
            </p>
          </div>
        ) : (
          <div className="pb-4">
            <p className="px-4 py-2 text-xs text-gray-400">
              {results.length} result{results.length !== 1 ? 's' : ''}
            </p>
            {Object.entries(grouped).map(([type, items]) => {
              const cfg = typeConfig[type as keyof typeof typeConfig];
              return (
                <div key={type}>
                  <div className="px-4 py-2 flex items-center gap-2">
                    <span className={`text-xs font-semibold uppercase tracking-wide ${cfg.color}`}>{cfg.label}s</span>
                    <span className="text-xs text-gray-400">({items.length})</span>
                  </div>
                  {items.map((r) => {
                    const globalIdx = flatResults.indexOf(r);
                    const isActive = globalIdx === activeIdx;
                    return (
                      <button
                        key={r.id}
                        onClick={() => handleSelect(r)}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b border-gray-50 last:border-b-0 cursor-pointer ${isActive ? 'bg-emerald-50' : ''}`}
                      >
                        <div className={`w-9 h-9 ${cfg.bg} rounded-lg flex items-center justify-center flex-shrink-0`}>
                          <i className={`${cfg.icon} ${cfg.color} text-sm`}></i>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{r.title}</p>
                          <p className="text-xs text-gray-400 truncate mt-0.5">{r.subtitle}</p>
                        </div>
                        {r.badge && (
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 whitespace-nowrap ${r.badgeColor}`}>
                            {r.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}