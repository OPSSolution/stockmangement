import { NavLink } from 'react-router-dom';

const bottomNavItems = [
  { label: 'Home', icon: 'ri-dashboard-3-line', path: '/' },
  { label: 'Inventory', icon: 'ri-archive-stack-line', path: '/inventory' },
  { label: 'Orders', icon: 'ri-shopping-bag-3-line', path: '/orders' },
  { label: 'Deliveries', icon: 'ri-truck-line', path: '/deliveries' },
  { label: 'More', icon: 'ri-menu-4-line', path: '/notifications/settings' },
];

export default function Footer() {
  return (
    <>
      {/* Mobile bottom nav — thumb-friendly quick access */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-gray-100/80 shadow-[0_-2px_12px_rgba(0,0,0,0.04)] safe-area-bottom">
        <div className="flex items-center justify-around">
          {bottomNavItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-0.5 py-2.5 flex-1 min-w-0 cursor-pointer ${
                  isActive ? 'text-emerald-600' : 'text-gray-400'
                }`
              }
            >
              <div className="w-5 h-5 flex items-center justify-center">
                <i className={`${item.icon} text-lg`}></i>
              </div>
              <span className="text-[10px] font-medium whitespace-nowrap">{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Desktop footer */}
      <footer className="hidden sm:block bg-white border-t border-gray-100 mt-auto">
        <div className="px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center">
              <i className="ri-box-3-fill text-white text-xs"></i>
            </div>
            <span className="text-sm font-semibold text-gray-800">StockManagement</span>
            <span className="text-xs text-gray-300">|</span>
            <span className="text-xs text-gray-400">Warehouse Management System</span>
          </div>
          <div className="flex items-center gap-4 text-xs text-gray-400">
            <span>v2.4.0</span>
            <a href="/" className="hover:text-gray-600 transition-colors cursor-pointer">Privacy</a>
            <a href="/" className="hover:text-gray-600 transition-colors cursor-pointer">Terms</a>
            <a href="/" className="hover:text-gray-600 transition-colors cursor-pointer">Support</a>
          </div>
        </div>
      </footer>
    </>
  );
}