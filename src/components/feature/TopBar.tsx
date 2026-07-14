import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import GlobalSearch from './GlobalSearch';
import MobileSearchOverlay from './MobileSearchOverlay';
import { useNotifications } from '@/contexts/NotificationContext';
import { useCurrency } from '@/contexts/CurrencyContext';

interface TopBarProps {
  title: string;
  subtitle?: string;
  onMenuClick?: () => void;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hrs < 24) return `${hrs}h ago`;
  return `${days}d ago`;
}

const typeMeta: Record<string, { icon: string; color: string; bg: string }> = {
  low_stock: { icon: 'ri-arrow-down-line', color: 'text-amber-500', bg: 'bg-amber-50' },
  out_of_stock: { icon: 'ri-close-circle-line', color: 'text-red-500', bg: 'bg-red-50' },
  new_request: { icon: 'ri-file-list-3-line', color: 'text-sky-500', bg: 'bg-sky-50' },
  new_order: { icon: 'ri-shopping-cart-line', color: 'text-emerald-500', bg: 'bg-emerald-50' },
  new_delivery: { icon: 'ri-truck-line', color: 'text-violet-500', bg: 'bg-violet-50' },
  new_transfer: { icon: 'ri-swap-box-line', color: 'text-indigo-500', bg: 'bg-indigo-50' },
  return_pending: { icon: 'ri-refresh-line', color: 'text-blue-500', bg: 'bg-blue-50' },
  transfer_ready: { icon: 'ri-truck-line', color: 'text-violet-500', bg: 'bg-violet-50' },
  delivery_delayed: { icon: 'ri-time-line', color: 'text-orange-500', bg: 'bg-orange-50' },
  system: { icon: 'ri-information-line', color: 'text-gray-500', bg: 'bg-gray-50' },
};

export default function TopBar({ title, subtitle, onMenuClick }: TopBarProps) {
  const [notifOpen, setNotifOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const { notifications, unreadCount, loading, markAsRead, markAllAsRead, deleteNotification } = useNotifications();
  const { displayMode, setDisplayMode } = useCurrency();
  const panelRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    }
    if (notifOpen) {
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }
  }, [notifOpen]);

  return (
    <>
      <header className="h-16 bg-white/90 backdrop-blur-md border-b border-gray-100/80 shadow-[0_1px_2px_rgba(0,0,0,0.02)] flex items-center justify-between px-4 md:px-6 sticky top-0 z-10">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onMenuClick}
            className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-100 transition-colors duration-200 lg:hidden cursor-pointer flex-shrink-0"
            aria-label="Open menu"
          >
            <i className="ri-menu-line text-gray-500 text-lg"></i>
          </button>
          <div className="min-w-0">
            <h2 className="text-lg md:text-xl font-bold text-gray-900 tracking-tight leading-tight truncate">{title}</h2>
            {subtitle && <p className="text-xs text-gray-400 mt-0.5 truncate hidden sm:block">{subtitle}</p>}
          </div>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          <button
            onClick={() => setSearchOpen(true)}
            className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors cursor-pointer sm:hidden"
            aria-label="Search"
          >
            <i className="ri-search-line text-gray-500 text-lg"></i>
          </button>

          <div className="hidden sm:block">
            <GlobalSearch />
          </div>

          {/* Currency Toggle */}
          <div className="hidden md:flex items-center bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setDisplayMode('usd')}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${displayMode === 'usd' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              USD
            </button>
            <button
              onClick={() => setDisplayMode('khr')}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${displayMode === 'khr' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              KHR
            </button>
          </div>

          <div className="relative" ref={panelRef}>
            <button
              onClick={() => setNotifOpen(!notifOpen)}
              className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors cursor-pointer relative"
            >
              <i className="ri-notification-3-line text-gray-500 text-lg"></i>
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full px-1">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {notifOpen && (
              <div className="absolute right-0 top-11 w-[320px] sm:w-96 bg-white border border-gray-100 rounded-2xl shadow-xl shadow-gray-200/60 z-50 py-2 flex flex-col max-h-[480px]">
                <div className="px-4 py-2 border-b border-gray-50 flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-800">Notifications</span>
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllAsRead}
                      className="text-xs text-emerald-600 font-medium cursor-pointer hover:text-emerald-700 whitespace-nowrap"
                    >
                      Mark all read
                    </button>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto">
                  {loading ? (
                    <div className="px-4 py-8 text-center">
                      <i className="ri-loader-4-line animate-spin text-gray-400"></i>
                      <p className="text-xs text-gray-400 mt-2">Loading...</p>
                    </div>
                  ) : notifications.length === 0 ? (
                    <div className="px-4 py-8 text-center">
                      <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-2">
                        <i className="ri-notification-off-line text-gray-300 text-xl"></i>
                      </div>
                      <p className="text-xs text-gray-400">No notifications yet</p>
                    </div>
                  ) : (
                    notifications.map((n) => {
                      const meta = typeMeta[n.type] || typeMeta.system;
                      return (
                        <div
                          key={n.id}
                          onClick={() => { markAsRead(n.id); setNotifOpen(false); }}
                          className={`px-4 py-3 hover:bg-gray-50 cursor-pointer flex items-start gap-3 border-b border-gray-50 last:border-b-0 ${
                            !n.is_read ? 'bg-emerald-50/30' : ''
                          }`}
                        >
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${meta.bg}`}>
                            <i className={`${meta.icon} ${meta.color} text-sm`}></i>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm ${!n.is_read ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>
                              {n.title}
                            </p>
                            <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{n.message}</p>
                            <div className="flex items-center justify-between mt-1.5">
                              <span className="text-[10px] text-gray-300">{timeAgo(n.created_at)}</span>
                              {!n.is_read && (
                                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full"></span>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteNotification(n.id);
                            }}
                            className="text-gray-300 hover:text-red-400 cursor-pointer mt-0.5"
                          >
                            <i className="ri-close-line text-sm"></i>
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="px-4 py-2 border-t border-gray-50 flex items-center justify-between">
                  <span className="text-[10px] text-gray-300">{unreadCount} unread · {notifications.length} total</span>
                  <button
                    onClick={() => { setNotifOpen(false); navigate('/notifications/settings'); }}
                    className="text-xs text-emerald-600 font-medium hover:text-emerald-700 cursor-pointer whitespace-nowrap"
                  >
                    Settings <i className="ri-arrow-right-s-line"></i>
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="text-xs text-gray-400 hidden lg:block whitespace-nowrap">
            <i className="ri-calendar-line mr-1"></i>
            {new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
          </div>
        </div>
      </header>

      <MobileSearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}