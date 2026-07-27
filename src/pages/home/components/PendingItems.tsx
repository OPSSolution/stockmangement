import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrency } from '@/contexts/CurrencyContext';

type PendingType = 'order' | 'delivery' | 'transfer' | 'return' | 'purchase' | 'request';

interface PendingItem {
  id: string;
  type: PendingType;
  title: string;
  subtitle: string;
  statusLabel: string;
  createdAt: string;
}

const TYPE_META: Record<PendingType, {
  label: string;
  permKey: string;
  icon: string;
  iconBg: string;
  iconColor: string;
  path: string;
  statusLabel: string;
}> = {
  order:    { label: 'Orders',    permKey: 'orders',    icon: 'ri-shopping-bag-3-line',  iconBg: 'bg-violet-50',  iconColor: 'text-violet-500',  path: '/orders',     statusLabel: 'Pending' },
  delivery: { label: 'Deliveries', permKey: 'deliveries', icon: 'ri-truck-line',           iconBg: 'bg-sky-50',     iconColor: 'text-sky-500',     path: '/deliveries', statusLabel: 'Awaiting Prep' },
  transfer: { label: 'Transfers', permKey: 'transfers', icon: 'ri-swap-box-line',        iconBg: 'bg-orange-50',  iconColor: 'text-orange-500',  path: '/transfers',  statusLabel: 'Requested' },
  return:   { label: 'Returns',   permKey: 'returns',   icon: 'ri-arrow-go-back-line',   iconBg: 'bg-amber-50',   iconColor: 'text-amber-500',   path: '/returns',    statusLabel: 'Pending' },
  purchase: { label: 'Purchases', permKey: 'purchases', icon: 'ri-shopping-cart-2-line', iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600', path: '/purchases',  statusLabel: 'Pending Approval' },
  request:  { label: 'Requests',  permKey: 'requests',  icon: 'ri-file-list-3-line',     iconBg: 'bg-pink-50',    iconColor: 'text-pink-500',    path: '/requests',   statusLabel: 'Pending' },
};

const TYPE_ORDER: PendingType[] = ['order', 'delivery', 'transfer', 'return', 'purchase', 'request'];

function formatTimeAgo(isoDate: string) {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function PendingItems() {
  const [items, setItems] = useState<PendingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<PendingType | null>(null);
  const { warehouseScope, canAccess } = useAuth();
  const { formatAmount } = useCurrency();
  const navigate = useNavigate();

  const visibleTypes = useMemo(
    () => TYPE_ORDER.filter((t) => canAccess(TYPE_META[t].permKey)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canAccess]
  );

  useEffect(() => {
    async function fetchPending() {
      setLoading(true);
      const scopeList = warehouseScope ? warehouseScope.join(',') : null;
      const results: PendingItem[] = [];

      const tasks: Promise<void>[] = [];

      if (visibleTypes.includes('order')) {
        tasks.push((async () => {
          const { data } = await supabase
            .from('orders')
            .select('id, customer, city, total, item_count, created_at')
            .eq('status', 'pending')
            .order('created_at', { ascending: false })
            .limit(25);
          (data || []).forEach((row: Record<string, unknown>) => {
            const itemCount = Number(row.item_count || 0);
            results.push({
              id: `order-${row.id}`,
              type: 'order',
              title: (row.customer as string) || `Order ${row.id}`,
              subtitle: `${row.city ? row.city + ' · ' : ''}${itemCount} item${itemCount !== 1 ? 's' : ''} · ${formatAmount(Number(row.total || 0))}`,
              statusLabel: TYPE_META.order.statusLabel,
              createdAt: (row.created_at as string) || '',
            });
          });
        })());
      }

      if (visibleTypes.includes('delivery')) {
        tasks.push((async () => {
          let q = supabase
            .from('deliveries')
            .select('id, order_id, customer, city, total_items, created_at')
            .eq('status', 'prepare')
            .order('created_at', { ascending: false })
            .limit(25);
          if (scopeList) q = q.or(`warehouse.in.(${scopeList}),destination.in.(${scopeList})`);
          const { data } = await q;
          (data || []).forEach((row: Record<string, unknown>) => {
            const totalItems = Number(row.total_items || 0);
            results.push({
              id: `delivery-${row.id}`,
              type: 'delivery',
              title: (row.customer as string) || (row.order_id as string) || `Delivery ${row.id}`,
              subtitle: `${row.city ? row.city + ' · ' : ''}${totalItems} item${totalItems !== 1 ? 's' : ''}`,
              statusLabel: TYPE_META.delivery.statusLabel,
              createdAt: (row.created_at as string) || '',
            });
          });
        })());
      }

      if (visibleTypes.includes('transfer')) {
        tasks.push((async () => {
          let q = supabase
            .from('transfers')
            .select('id, from_warehouse, to_warehouse, total_items, reason, created_at')
            .eq('status', 'requested')
            .order('created_at', { ascending: false })
            .limit(25);
          if (scopeList) q = q.or(`from_warehouse.in.(${scopeList}),to_warehouse.in.(${scopeList})`);
          const { data } = await q;
          (data || []).forEach((row: Record<string, unknown>) => {
            const totalItems = Number(row.total_items || 0);
            results.push({
              id: `transfer-${row.id}`,
              type: 'transfer',
              title: `${row.from_warehouse} → ${row.to_warehouse}`,
              subtitle: `${row.reason ? row.reason + ' · ' : ''}${totalItems} item${totalItems !== 1 ? 's' : ''}`,
              statusLabel: TYPE_META.transfer.statusLabel,
              createdAt: (row.created_at as string) || '',
            });
          });
        })());
      }

      if (visibleTypes.includes('return')) {
        tasks.push((async () => {
          let q = supabase
            .from('returns')
            .select('id, customer, total_items, total_value, reason, warehouse, created_at')
            .eq('status', 'pending')
            .order('created_at', { ascending: false })
            .limit(25);
          if (warehouseScope) q = q.in('warehouse', warehouseScope);
          const { data } = await q;
          (data || []).forEach((row: Record<string, unknown>) => {
            const totalItems = Number(row.total_items || 0);
            results.push({
              id: `return-${row.id}`,
              type: 'return',
              title: (row.customer as string) || `Return ${row.id}`,
              subtitle: `${row.reason ? row.reason + ' · ' : ''}${totalItems} item${totalItems !== 1 ? 's' : ''} · ${formatAmount(Number(row.total_value || 0))}`,
              statusLabel: TYPE_META.return.statusLabel,
              createdAt: (row.created_at as string) || '',
            });
          });
        })());
      }

      if (visibleTypes.includes('purchase')) {
        tasks.push((async () => {
          let q = supabase
            .from('purchases')
            .select('id, vendor, warehouse, total, total_items, created_at')
            .eq('status', 'pending')
            .order('created_at', { ascending: false })
            .limit(25);
          if (warehouseScope) q = q.in('warehouse', warehouseScope);
          const { data } = await q;
          (data || []).forEach((row: Record<string, unknown>) => {
            const totalItems = Number(row.total_items || 0);
            results.push({
              id: `purchase-${row.id}`,
              type: 'purchase',
              title: (row.vendor as string) || `Purchase ${row.id}`,
              subtitle: `${row.warehouse ? row.warehouse + ' · ' : ''}${totalItems} item${totalItems !== 1 ? 's' : ''} · ${formatAmount(Number(row.total || 0))}`,
              statusLabel: TYPE_META.purchase.statusLabel,
              createdAt: (row.created_at as string) || '',
            });
          });
        })());
      }

      if (visibleTypes.includes('request')) {
        tasks.push((async () => {
          let q = supabase
            .from('stock_requests')
            .select('id, reference, requested_by, warehouse, total_items, created_at')
            .eq('status', 'pending')
            .order('created_at', { ascending: false })
            .limit(25);
          if (warehouseScope) q = q.in('warehouse', warehouseScope);
          const { data } = await q;
          (data || []).forEach((row: Record<string, unknown>) => {
            const totalItems = Number(row.total_items || 0);
            results.push({
              id: `request-${row.id}`,
              type: 'request',
              title: (row.reference as string) || (row.requested_by as string) || `Request ${row.id}`,
              subtitle: `${row.warehouse ? row.warehouse + ' · ' : ''}${totalItems} item${totalItems !== 1 ? 's' : ''}${row.requested_by ? ' · ' + row.requested_by : ''}`,
              statusLabel: TYPE_META.request.statusLabel,
              createdAt: (row.created_at as string) || '',
            });
          });
        })());
      }

      await Promise.all(tasks);
      results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setItems(results);
      setLoading(false);
    }

    if (visibleTypes.length > 0) {
      fetchPending();
    } else {
      setItems([]);
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouseScope, visibleTypes]);

  const counts = useMemo(() => {
    const c: Partial<Record<PendingType, number>> = {};
    for (const item of items) c[item.type] = (c[item.type] || 0) + 1;
    return c;
  }, [items]);

  const filteredItems = filter ? items.filter((i) => i.type === filter) : items;

  if (visibleTypes.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
      <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-gray-900 tracking-tight">Pending Actions</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {loading ? 'Checking modules for pending items…' : `${items.length} item${items.length !== 1 ? 's' : ''} across ${visibleTypes.length} module${visibleTypes.length !== 1 ? 's' : ''} awaiting action`}
          </p>
        </div>
        {!loading && items.length > 0 && (
          <span className="flex items-center gap-1 text-xs font-semibold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full">
            <i className="ri-time-line text-sm"></i>
            {items.length} Pending
          </span>
        )}
      </div>

      {!loading && items.length > 0 && (
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2 overflow-x-auto">
          <button
            onClick={() => setFilter(null)}
            className={`flex-shrink-0 text-xs font-medium px-3 py-1.5 rounded-full whitespace-nowrap transition-colors cursor-pointer ${
              filter === null ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
            }`}
          >
            All ({items.length})
          </button>
          {visibleTypes.filter((t) => counts[t]).map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`flex-shrink-0 flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full whitespace-nowrap transition-colors cursor-pointer ${
                filter === t ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
              }`}
            >
              <i className={TYPE_META[t].icon}></i>
              {TYPE_META[t].label} ({counts[t]})
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="px-5 py-8 flex items-center gap-2 text-gray-400">
          <i className="ri-loader-4-line animate-spin"></i>
          <span className="text-sm">Loading pending items...</span>
        </div>
      ) : items.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-2">
            <i className="ri-check-line text-emerald-400 text-xl"></i>
          </div>
          <p className="text-xs text-gray-400">All caught up — nothing pending right now</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-50 max-h-[420px] overflow-y-auto">
          {filteredItems.map((item) => {
            const meta = TYPE_META[item.type];
            return (
              <button
                key={item.id}
                onClick={() => navigate(meta.path)}
                className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50/40 transition-colors text-left cursor-pointer"
              >
                <div className={`w-9 h-9 rounded-lg ${meta.iconBg} flex items-center justify-center flex-shrink-0`}>
                  <i className={`${meta.icon} ${meta.iconColor} text-sm`}></i>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-semibold text-gray-800 truncate">{item.title}</p>
                    <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide flex-shrink-0">{meta.label}</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5 truncate">{item.subtitle}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap">
                    {item.statusLabel}
                  </span>
                  <p className="text-xs text-gray-400 mt-1">{item.createdAt ? formatTimeAgo(item.createdAt) : ''}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
