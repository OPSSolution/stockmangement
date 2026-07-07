import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

interface Activity {
  id: string;
  type: string;
  description: string;
  product: string;
  quantity: number;
  warehouse: string;
  user_name: string;
  created_at: string;
}

const typeConfig: Record<string, { icon: string; iconBg: string; iconColor: string; label: string }> = {
  sale:       { icon: 'ri-shopping-bag-3-line',  iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600', label: 'Sale' },
  purchase:   { icon: 'ri-shopping-cart-2-line', iconBg: 'bg-sky-50',     iconColor: 'text-sky-600',     label: 'Purchase' },
  transfer:   { icon: 'ri-swap-box-line',         iconBg: 'bg-violet-50',  iconColor: 'text-violet-500',  label: 'Transfer' },
  return:     { icon: 'ri-arrow-go-back-line',    iconBg: 'bg-amber-50',   iconColor: 'text-amber-500',   label: 'Return' },
  adjustment: { icon: 'ri-equalizer-2-line',      iconBg: 'bg-orange-50',  iconColor: 'text-orange-500',  label: 'Adjustment' },
};

const FILTER_OPTIONS = [
  { key: null,         label: 'All Activity',  icon: 'ri-list-check',         iconBg: 'bg-gray-100',    iconColor: 'text-gray-500' },
  { key: 'sale',       label: 'Sales',         icon: 'ri-shopping-bag-3-line', iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600' },
  { key: 'purchase',   label: 'Purchases',     icon: 'ri-shopping-cart-2-line',iconBg: 'bg-sky-50',     iconColor: 'text-sky-600' },
  { key: 'transfer',   label: 'Transfers',     icon: 'ri-swap-box-line',       iconBg: 'bg-violet-50',  iconColor: 'text-violet-500' },
  { key: 'return',     label: 'Returns',       icon: 'ri-arrow-go-back-line',  iconBg: 'bg-amber-50',   iconColor: 'text-amber-500' },
  { key: 'adjustment', label: 'Adjustments',   icon: 'ri-equalizer-2-line',    iconBg: 'bg-orange-50',  iconColor: 'text-orange-500' },
] as const;

type FilterKey = typeof FILTER_OPTIONS[number]['key'];

const PAGE_SIZE = 7;

export default function RecentActivity() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [filter, setFilter] = useState<FilterKey>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [dropdownOpen]);

  const fetchActivities = useCallback(async (activeFilter: FilterKey) => {
    setLoading(true);
    let query = supabase
      .from('activity_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);
    if (activeFilter) query = query.eq('type', activeFilter);
    const { data, error } = await query;
    if (!error && data) {
      setActivities(data as Activity[]);
      setHasMore(data.length === PAGE_SIZE);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchActivities(filter);
  }, [filter, fetchActivities]);

  const loadMore = async () => {
    setLoadingMore(true);
    let query = supabase
      .from('activity_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE)
      .offset(activities.length);
    if (filter) query = query.eq('type', filter);
    const { data, error } = await query;
    if (!error && data) {
      setActivities(prev => [...prev, ...data as Activity[]]);
      setHasMore(data.length === PAGE_SIZE);
    }
    setLoadingMore(false);
  };

  const selectFilter = (key: FilterKey) => {
    setFilter(key);
    setDropdownOpen(false);
  };

  const activeOption = FILTER_OPTIONS.find(o => o.key === filter) ?? FILTER_OPTIONS[0];

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-gray-900 tracking-tight">Recent Activity</h3>
          <p className="text-xs text-gray-400 mt-0.5">Stock history &amp; movements</p>
        </div>

        {/* Filter dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(o => !o)}
            className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 hover:text-emerald-700 cursor-pointer whitespace-nowrap px-2 py-1 rounded-lg hover:bg-emerald-50 transition-colors"
          >
            <i className={`${activeOption.icon} text-xs`}></i>
            {activeOption.label === 'All Activity' ? 'View History' : activeOption.label}
            <i className={`ri-arrow-down-s-line text-xs transition-transform ${dropdownOpen ? 'rotate-180' : ''}`}></i>
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 top-8 w-44 bg-white border border-gray-100 rounded-2xl shadow-lg shadow-gray-200/50 z-20 py-1 overflow-hidden">
              {FILTER_OPTIONS.map((opt) => (
                <button
                  key={String(opt.key)}
                  onClick={() => selectFilter(opt.key)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium transition-colors cursor-pointer text-left ${
                    filter === opt.key
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <div className={`w-6 h-6 rounded-md ${opt.iconBg} flex items-center justify-center flex-shrink-0`}>
                    <i className={`${opt.icon} ${opt.iconColor} text-xs`}></i>
                  </div>
                  {opt.label}
                  {filter === opt.key && <i className="ri-check-line ml-auto text-emerald-600"></i>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Activity list */}
      {loading ? (
        <div className="px-5 py-8 flex items-center gap-2 text-gray-400">
          <i className="ri-loader-4-line animate-spin"></i>
          <span className="text-sm">Loading...</span>
        </div>
      ) : activities.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <div className="w-10 h-10 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-2">
            <i className={`${activeOption.icon} text-gray-300 text-lg`}></i>
          </div>
          <p className="text-xs text-gray-400">No {activeOption.label.toLowerCase()} found</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {activities.map((act) => {
            const tc = typeConfig[act.type] || typeConfig.adjustment;
            const isNeg = act.quantity < 0;
            return (
              <div key={act.id} className="px-5 py-3.5 hover:bg-gray-50/40 transition-colors flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg ${tc.iconBg} flex items-center justify-center flex-shrink-0`}>
                  <i className={`${tc.icon} ${tc.iconColor} text-sm`}></i>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-800 truncate">{act.description}</p>
                  <p className="text-xs text-gray-400 mt-0.5 truncate">{act.product} · {act.warehouse}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className={`text-sm font-bold ${isNeg ? 'text-red-500' : 'text-emerald-600'}`}>
                    {isNeg ? '' : '+'}{act.quantity}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {act.created_at ? new Date(act.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Load More */}
      {!loading && hasMore && (
        <div className="px-5 py-3 border-t border-gray-100">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="text-xs text-emerald-600 font-medium hover:text-emerald-700 cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
          >
            {loadingMore
              ? <><i className="ri-loader-4-line animate-spin"></i> Loading...</>
              : <>Load More <i className="ri-arrow-down-s-line"></i></>
            }
          </button>
        </div>
      )}
    </div>
  );
}
