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

function buildSearchIndex(): SearchResult[] {
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
}

const searchIndex = buildSearchIndex();

function highlight(text: string, query: string): string {
  if (!query) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`(${escaped})`, 'gi'), '<mark class="bg-emerald-100 text-emerald-800 rounded px-0.5">$1</mark>');
}

export default function GlobalSearch() {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
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
      }).slice(0, 8);

  // Group results by type
  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    if (!acc[r.type]) acc[r.type] = [];
    acc[r.type].push(r);
    return acc;
  }, {});

  const flatResults = Object.values(grouped).flat();

  const handleSelect = useCallback((result: SearchResult) => {
    navigate(result.path);
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
  }, [navigate]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open || flatResults.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % flatResults.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => (i - 1 + flatResults.length) % flatResults.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (flatResults[activeIdx]) handleSelect(flatResults[activeIdx]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  useEffect(() => { setActiveIdx(0); }, [query]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard shortcut: Cmd/Ctrl + K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <div className="relative flex items-center">
        <div className="w-4 h-4 flex items-center justify-center absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
          <i className="ri-search-line text-gray-400 text-sm"></i>
        </div>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search products, orders, returns…"
          className="pl-9 pr-14 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg w-72 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-300 focus:bg-white transition-all"
        />
        <kbd className="absolute right-3 hidden lg:flex items-center gap-0.5 px-1.5 py-0.5 text-xs text-gray-400 bg-gray-100 rounded border border-gray-200">
          <span className="text-xs">⌘</span>K
        </kbd>
      </div>

      {open && query.trim().length > 0 && (
        <div className="absolute top-full left-0 mt-2 w-[480px] bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden">
          {flatResults.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400">
              <i className="ri-search-line text-2xl block mb-2 opacity-40"></i>
              No results for &ldquo;<span className="font-medium text-gray-600">{query}</span>&rdquo;
            </div>
          ) : (
            <>
              <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
                <p className="text-xs text-gray-400">{flatResults.length} result{flatResults.length !== 1 ? 's' : ''} found</p>
                <div className="flex gap-3 text-xs text-gray-400">
                  <span><kbd className="px-1 py-0.5 bg-gray-100 rounded border border-gray-200 text-xs">↑↓</kbd> navigate</span>
                  <span><kbd className="px-1 py-0.5 bg-gray-100 rounded border border-gray-200 text-xs">↵</kbd> go</span>
                  <span><kbd className="px-1 py-0.5 bg-gray-100 rounded border border-gray-200 text-xs">Esc</kbd> close</span>
                </div>
              </div>

              <div className="max-h-80 overflow-y-auto py-1">
                {Object.entries(grouped).map(([type, items]) => {
                  const cfg = typeConfig[type as keyof typeof typeConfig];
                  return (
                    <div key={type}>
                      <div className="px-4 py-1.5 flex items-center gap-2">
                        <span className={`text-xs font-semibold uppercase tracking-wide ${cfg.color}`}>{cfg.label}s</span>
                        <span className="text-xs text-gray-400">({items.length})</span>
                      </div>
                      {items.map((r) => {
                        const globalIdx = flatResults.indexOf(r);
                        const isActive = globalIdx === activeIdx;
                        return (
                          <button
                            key={r.id}
                            onMouseEnter={() => setActiveIdx(globalIdx)}
                            onClick={() => handleSelect(r)}
                            className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors cursor-pointer ${isActive ? 'bg-emerald-50' : 'hover:bg-gray-50'}`}
                          >
                            <div className={`w-8 h-8 ${cfg.bg} rounded-lg flex items-center justify-center flex-shrink-0`}>
                              <i className={`${cfg.icon} ${cfg.color} text-sm`}></i>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p
                                className="text-sm font-medium text-gray-800 truncate"
                                dangerouslySetInnerHTML={{ __html: highlight(r.title, query) }}
                              />
                              <p
                                className="text-xs text-gray-400 truncate mt-0.5"
                                dangerouslySetInnerHTML={{ __html: highlight(r.subtitle, query) }}
                              />
                            </div>
                            {r.badge && (
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 whitespace-nowrap ${r.badgeColor}`}>
                                {r.badge}
                              </span>
                            )}
                            {isActive && (
                              <i className="ri-corner-down-left-line text-xs text-gray-400 flex-shrink-0"></i>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>

              <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between">
                <p className="text-xs text-gray-400">Searching across all modules</p>
                <div className="flex gap-2 text-xs text-gray-400">
                  {Object.entries(grouped).map(([type]) => {
                    const cfg = typeConfig[type as keyof typeof typeConfig];
                    return (
                      <span key={type} className={`flex items-center gap-1 ${cfg.color}`}>
                        <i className={`${cfg.icon} text-xs`}></i>
                        {grouped[type].length}
                      </span>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}