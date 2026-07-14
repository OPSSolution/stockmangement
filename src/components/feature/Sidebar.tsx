import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import type { UserRole } from '../../contexts/AuthContext';
import { useRef, useCallback } from 'react';
222
type NavItem = {
  label: string;
  icon: string;
  path: string;
  permKey: string;
};

const mainNavItems: NavItem[] = [
  { label: 'Dashboard',  icon: 'ri-dashboard-3-line',     path: '/',           permKey: 'dashboard' },
  { label: 'Inventory',  icon: 'ri-archive-stack-line',   path: '/inventory',  permKey: 'inventory' },
  { label: 'Warehouses', icon: 'ri-building-2-line',      path: '/warehouses', permKey: 'warehouses' },
  { label: 'Vendors',    icon: 'ri-store-2-line',         path: '/vendors',    permKey: 'vendors' },
  { label: 'Orders',     icon: 'ri-shopping-bag-3-line',  path: '/orders',     permKey: 'orders' },
  { label: 'Deliveries', icon: 'ri-truck-line',           path: '/deliveries', permKey: 'deliveries' },
  { label: 'Transfers',  icon: 'ri-swap-box-line',        path: '/transfers',  permKey: 'transfers' },
  { label: 'Requests',   icon: 'ri-file-list-3-line',     path: '/requests',   permKey: 'requests' },
  { label: 'Returns',    icon: 'ri-arrow-go-back-line',   path: '/returns',    permKey: 'returns' },
  // { label: 'Purchases',  icon: 'ri-shopping-cart-2-line', path: '/purchases',  permKey: 'purchases' },
  { label: 'Promotions', icon: 'ri-price-tag-3-line',     path: '/promotions', permKey: 'promotions' },
];

const managementNavItems: NavItem[] = [
  { label: 'Reports',      icon: 'ri-bar-chart-2-line',  path: '/reports',      permKey: 'reports' },
  { label: 'Teams',        icon: 'ri-team-line',         path: '/teams',        permKey: 'teams' },
  // { label: 'Requirements', icon: 'ri-list-check-2',      path: '/requirements', permKey: 'requirements' },
  { label: 'Roles',        icon: 'ri-shield-user-line',  path: '/admin/roles',  permKey: 'roles' },
  { label: 'Request Templates', icon: 'ri-file-list-2-line', path: '/admin/request-templates', permKey: 'request_templates' },
];

// const adminNavItems: NavItem[] = [
//   { label: 'Categories', icon: 'ri-price-tag-2-line', path: '/admin/categories', permKey: 'categories' },
// ];

const notificationNavItems: NavItem[] = [
  { label: 'History',   icon: 'ri-history-line',        path: '/notifications/history',   permKey: 'notifications_history' },
  // { label: 'Analytics', icon: 'ri-bar-chart-box-line',  path: '/notifications/analytics', permKey: 'notifications_analytics' },
  { label: 'Settings',  icon: 'ri-notification-3-line', path: '/notifications/settings',  permKey: 'notifications_settings' },
];

const ROLE_META: Record<UserRole, { label: string; icon: string; cls: string }> = {
  admin:  { label: 'Admin',  icon: 'ri-shield-star-line',    cls: 'bg-purple-100 text-purple-700' },
  staff:  { label: 'Staff',  icon: 'ri-user-settings-line',  cls: 'bg-sky-100 text-sky-700' },
  viewer: { label: 'Viewer', icon: 'ri-eye-line',            cls: 'bg-amber-100 text-amber-700' },
};

interface SidebarProps {
  mobileOpen?: boolean;
  onClose?: () => void;
}

function NavItemLink({ item, onClose }: { item: NavItem; onClose?: () => void }) {
  return (
    <NavLink
      to={item.path}
      end={item.path === '/'}
      onClick={onClose}
      className={({ isActive }) =>
        `relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer whitespace-nowrap ${
          isActive
            ? 'bg-emerald-50 text-emerald-700'
            : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
        }`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-emerald-500 rounded-r-full" />
          )}
          <div className="w-5 h-5 flex items-center justify-center">
            <i className={`${item.icon} text-base ${isActive ? 'text-emerald-600' : 'text-gray-400'}`}></i>
          </div>
          {item.label}
        </>
      )}
    </NavLink>
  );
}

export default function Sidebar({ mobileOpen, onClose }: SidebarProps) {
  const { profile, signOut, canAccess } = useAuth();
  const navigate = useNavigate();
  const sidebarRef = useRef<HTMLElement>(null);
  const touchStartX = useRef<number | null>(null);

  const role = (profile?.role ?? 'viewer') as UserRole;
  const roleMeta = ROLE_META[role];

  const visibleMain          = mainNavItems.filter(i => canAccess(i.permKey));
  const visibleManagement    = managementNavItems.filter(i => canAccess(i.permKey));
  const visibleNotifications = notificationNavItems.filter(i => canAccess(i.permKey));
  // const visibleAdmin         = adminNavItems.filter(i => canAccess(i.permKey));

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (touchStartX.current === null || !onClose) return;
    const diff = touchStartX.current - e.touches[0].clientX;
    if (diff > 80) { onClose(); touchStartX.current = null; }
  }, [onClose]);

  const handleTouchEnd = useCallback(() => { touchStartX.current = null; }, []);

  return (
    <aside
      ref={sidebarRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className={`w-60 h-dvh bg-white border-r border-gray-100/80 shadow-[1px_0_16px_rgba(0,0,0,0.02)] flex flex-col fixed left-0 top-0 z-30 transition-transform duration-300 ease-in-out ${
        mobileOpen ? 'translate-x-0' : '-translate-x-full'
      } lg:translate-x-0`}
    >
      {/* Brand */}
      <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-sm shadow-emerald-500/30">
            <i className="ri-box-3-fill text-white text-sm"></i>
          </div>
          <div>
            <span className="text-base font-bold text-gray-900 tracking-tight">StockManagement</span>
            <p className="text-xs text-gray-400 leading-none mt-0.5">{profile?.full_name || 'Staff'}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors lg:hidden cursor-pointer"
        >
          <i className="ri-close-line text-lg"></i>
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 min-h-0 px-3 py-4 overflow-y-auto space-y-0.5">
        {/* Main Menu */}
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest px-3 mb-3">Main Menu</p>
        {visibleMain.map(item => (
          <NavItemLink key={item.path} item={item} onClose={onClose} />
        ))}

        {/* Management */}
        {visibleManagement.length > 0 && (
          <>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest px-3 mb-3 mt-6">Management</p>
            {visibleManagement.map(item => (
              <NavItemLink key={item.path} item={item} onClose={onClose} />
            ))}
          </>
        )}

        {/* Notifications */}
        {visibleNotifications.length > 0 && (
          <>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest px-3 mb-3 mt-6">Notifications</p>
            {visibleNotifications.map(item => (
              <NavItemLink key={item.path} item={item} onClose={onClose} />
            ))}
          </>
        )}

        {/* Admin */}
        {/* {visibleAdmin.length > 0 && (
          <>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest px-3 mb-3 mt-6">Admin</p>
            {visibleAdmin.map(item => (
              <NavItemLink key={item.path} item={item} onClose={onClose} />
            ))}
          </>
        )} */}
      </nav>

      {/* User profile */}
      <div className="px-4 py-4 border-t border-gray-100 flex-shrink-0">
        {/* Role badge */}
        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold mb-3 ${roleMeta.cls}`}>
          <i className={`${roleMeta.icon} text-xs`}></i>
          {roleMeta.label}
        </div>

        <div className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-gray-50 cursor-pointer transition-colors duration-200">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-100 to-emerald-200/60 flex items-center justify-center flex-shrink-0">
            <i className="ri-user-line text-emerald-600 text-sm"></i>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{profile?.full_name || 'User'}</p>
            <p className="text-xs text-gray-400 truncate">{profile?.email}</p>
          </div>
          <button
            onClick={handleSignOut}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
            title="Sign out"
          >
            <i className="ri-door-open-line text-base"></i>
          </button>
        </div>
      </div>
    </aside>
  );
}
