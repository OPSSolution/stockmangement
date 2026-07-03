import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useNotifications } from '@/contexts/NotificationContext';
import { useAuth } from '@/contexts/AuthContext';
import DashboardLayout from '@/components/feature/DashboardLayout';

const TYPE_OPTIONS = [
  { value: 'all', label: 'All Types', icon: 'ri-notification-3-line' },
  { value: 'low_stock', label: 'Low Stock', icon: 'ri-arrow-down-line' },
  { value: 'out_of_stock', label: 'Out of Stock', icon: 'ri-close-circle-line' },
  { value: 'new_order', label: 'New Order', icon: 'ri-shopping-cart-line' },
  { value: 'return_pending', label: 'Return Pending', icon: 'ri-refresh-line' },
  { value: 'transfer_ready', label: 'Transfer Ready', icon: 'ri-truck-line' },
  { value: 'delivery_delayed', label: 'Delivery Delayed', icon: 'ri-time-line' },
  { value: 'system', label: 'System', icon: 'ri-information-line' },
];

const STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
  { value: 'read', label: 'Read' },
];

const typeMeta: Record<string, { icon: string; color: string; bg: string }> = {
  low_stock: { icon: 'ri-arrow-down-line', color: 'text-amber-500', bg: 'bg-amber-50' },
  out_of_stock: { icon: 'ri-close-circle-line', color: 'text-red-500', bg: 'bg-red-50' },
  new_order: { icon: 'ri-shopping-cart-line', color: 'text-emerald-500', bg: 'bg-emerald-50' },
  return_pending: { icon: 'ri-refresh-line', color: 'text-blue-500', bg: 'bg-blue-50' },
  transfer_ready: { icon: 'ri-truck-line', color: 'text-violet-500', bg: 'bg-violet-50' },
  delivery_delayed: { icon: 'ri-time-line', color: 'text-orange-500', bg: 'bg-orange-50' },
  system: { icon: 'ri-information-line', color: 'text-gray-500', bg: 'bg-gray-50' },
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface ToastState {
  visible: boolean;
  message: string;
  type: 'success' | 'error';
}

export default function NotificationHistoryPage() {
  const { notifications: liveNotifications, markAsRead, markAllAsRead, deleteNotification } = useNotifications();
  const { canDelete } = useAuth();
  const showDelete = canDelete('notifications_history');
  const navigate = useNavigate();

  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');
  const [filtered, setFiltered] = useState(liveNotifications);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [toast, setToast] = useState<ToastState>({ visible: false, message: '', type: 'success' });

  const pageSize = 15;

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ visible: true, message, type });
    setTimeout(() => setToast((prev) => ({ ...prev, visible: false })), 3000);
  }, []);

  const applyFilters = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false });

    if (typeFilter !== 'all') {
      query = query.eq('type', typeFilter);
    }
    if (statusFilter === 'unread') {
      query = query.eq('is_read', false);
    } else if (statusFilter === 'read') {
      query = query.eq('is_read', true);
    }
    if (dateFrom) {
      query = query.gte('created_at', new Date(dateFrom).toISOString());
    }
    if (dateTo) {
      query = query.lte('created_at', new Date(dateTo + 'T23:59:59').toISOString());
    }
    if (search.trim()) {
      query = query.or(`title.ilike.%${search}%,message.ilike.%${search}%`);
    }

    const { data, error } = await query.limit(200);

    if (!error && data) {
      setFiltered(data as typeof liveNotifications);
    }
    setLoading(false);
    setPage(1);
  }, [typeFilter, statusFilter, dateFrom, dateTo, search]);

  useEffect(() => {
    applyFilters();
  }, [applyFilters]);

  // Re-sync when live notifications change significantly
  useEffect(() => {
    setFiltered((prev) => {
      const liveIds = new Set(liveNotifications.map((n) => n.id));
      const merged = [...liveNotifications];
      for (const p of prev) {
        if (!liveIds.has(p.id)) merged.push(p);
      }
      return merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    });
  }, [liveNotifications]);

  const handleDeleteAllRead = async () => {
    const { error } = await supabase.from('notifications').delete().eq('is_read', true);
    if (error) {
      showToast('Failed to delete read notifications', 'error');
    } else {
      showToast('Read notifications cleared');
      applyFilters();
    }
  };

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <DashboardLayout title="Notification History">
      <div className="max-w-5xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Notification History</h1>
            <p className="text-sm text-gray-400 mt-1">
              {filtered.length} notifications total · {filtered.filter((n) => !n.is_read).length} unread
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/notifications/settings')}
              className="px-4 py-2 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap cursor-pointer"
            >
              <i className="ri-settings-3-line mr-1"></i>
              Settings
            </button>
            <button
              onClick={markAllAsRead}
              className="px-4 py-2 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap cursor-pointer"
            >
              Mark All Read
            </button>
            {showDelete && (
              <button
                onClick={handleDeleteAllRead}
                className="px-4 py-2 border border-red-200 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50 transition-colors whitespace-nowrap cursor-pointer"
              >
                Clear Read
              </button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl border border-gray-100 p-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 flex-1 min-w-[200px]">
            <i className="ri-search-line text-gray-400 text-sm"></i>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
              placeholder="Search notifications..."
              className="bg-transparent text-sm text-gray-800 placeholder-gray-400 focus:outline-none w-full"
            />
          </div>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-700 focus:outline-none focus:border-emerald-400 cursor-pointer"
          >
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-700 focus:outline-none focus:border-emerald-400 cursor-pointer"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-700 focus:outline-none focus:border-emerald-400"
            />
            <span className="text-xs text-gray-400">to</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-700 focus:outline-none focus:border-emerald-400"
            />
          </div>

          <button
            onClick={applyFilters}
            className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors whitespace-nowrap cursor-pointer"
          >
            Apply
          </button>
        </div>

        {/* List */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          {loading ? (
            <div className="py-16 text-center">
              <i className="ri-loader-4-line animate-spin text-gray-400 text-2xl"></i>
              <p className="text-sm text-gray-400 mt-2">Loading notifications...</p>
            </div>
          ) : paginated.length === 0 ? (
            <div className="py-16 text-center">
              <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-3">
                <i className="ri-notification-off-line text-gray-300 text-2xl"></i>
              </div>
              <p className="text-sm text-gray-500 font-medium">No notifications match your filters</p>
              <p className="text-xs text-gray-400 mt-1">Try adjusting your search or date range</p>
            </div>
          ) : (
            <>
              <div className="divide-y divide-gray-50">
                {paginated.map((n) => {
                  const meta = typeMeta[n.type] || typeMeta.system;
                  return (
                    <div
                      key={n.id}
                      className={`px-5 py-4 flex items-start gap-4 hover:bg-gray-50/60 transition-colors ${
                        !n.is_read ? 'bg-emerald-50/20' : ''
                      }`}
                    >
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${meta.bg}`}>
                        <i className={`${meta.icon} ${meta.color} text-sm`}></i>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className={`text-sm ${!n.is_read ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                            {n.title}
                          </p>
                          {!n.is_read && (
                            <span className="w-2 h-2 bg-emerald-400 rounded-full"></span>
                          )}
                          {n.is_emailed && (
                            <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded flex items-center gap-1">
                              <i className="ri-mail-line"></i> Emailed
                            </span>
                          )}
                          {n.is_sms_sent && (
                            <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded flex items-center gap-1">
                              <i className="ri-message-3-line"></i> SMS
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 mt-0.5">{n.message}</p>
                        <p className="text-xs text-gray-300 mt-1.5">{formatDate(n.created_at)}</p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {!n.is_read && (
                          <button
                            onClick={() => markAsRead(n.id)}
                            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-emerald-50 text-gray-400 hover:text-emerald-500 transition-colors cursor-pointer"
                            title="Mark as read"
                          >
                            <i className="ri-check-line text-sm"></i>
                          </button>
                        )}
                        {showDelete && (
                          <button
                            onClick={() => deleteNotification(n.id)}
                            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors cursor-pointer"
                            title="Delete"
                          >
                            <i className="ri-delete-bin-line text-sm"></i>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="px-5 py-3 border-t border-gray-50 flex items-center justify-between">
                  <span className="text-xs text-gray-400">
                    Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, filtered.length)} of {filtered.length}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                      <i className="ri-arrow-left-s-line"></i>
                    </button>
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      const p = i + 1;
                      return (
                        <button
                          key={p}
                          onClick={() => setPage(p)}
                          className={`w-8 h-8 flex items-center justify-center rounded-lg text-xs font-medium cursor-pointer ${
                            p === page
                              ? 'bg-emerald-600 text-white'
                              : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          {p}
                        </button>
                      );
                    })}
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                      <i className="ri-arrow-right-s-line"></i>
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast.visible && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium transition-all ${
            toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-500 text-white'
          }`}
        >
          <div className="flex items-center gap-2">
            <i
              className={`${
                toast.type === 'success' ? 'ri-check-line' : 'ri-error-warning-line'
              } text-base`}
            ></i>
            {toast.message}
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}