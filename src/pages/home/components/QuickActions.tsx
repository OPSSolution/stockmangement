import { useNavigate } from 'react-router-dom';

interface Action {
  label: string;
  icon: string;
  iconBg: string;
  iconColor: string;
  desc: string;
  path: string;
}

const actions: Action[] = [
  { label: 'Add Product',       icon: 'ri-add-box-line',          iconBg: 'from-emerald-50 to-emerald-100/60', iconColor: 'text-emerald-600', desc: 'Add new product to inventory',  path: '/inventory?action=add'    },
  { label: 'Create Transfer',   icon: 'ri-swap-box-line',          iconBg: 'from-sky-50 to-sky-100/60',     iconColor: 'text-sky-600',     desc: 'Vendor → BM transfer request', path: '/transfers?action=new'    },
  { label: 'New Purchase Order',icon: 'ri-shopping-cart-2-line',   iconBg: 'from-violet-50 to-violet-100/60',  iconColor: 'text-violet-600',  desc: 'BM procurement order',          path: '/purchases?action=new'    },
  { label: 'Process Return',    icon: 'ri-arrow-go-back-line',     iconBg: 'from-amber-50 to-amber-100/60',   iconColor: 'text-amber-600',   desc: 'Handle customer return',        path: '/returns'                 },
  { label: 'Create Promotion',  icon: 'ri-price-tag-3-line',       iconBg: 'from-pink-50 to-pink-100/60',    iconColor: 'text-pink-500',    desc: 'Set discount rules',            path: '/promotions?action=new'   },
  { label: 'Adjust Stock',      icon: 'ri-equalizer-2-line',       iconBg: 'from-orange-50 to-orange-100/60',  iconColor: 'text-orange-500',  desc: 'Manual stock correction',       path: '/inventory'               },
];

export default function QuickActions() {
  const navigate = useNavigate();

  return (
    <div className="h-[400px] bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col">
      <div className="px-5 py-4 border-b border-gray-100 shrink-0">
        <h3 className="text-sm font-bold text-gray-900 tracking-tight">Quick Actions</h3>
        <p className="text-xs text-gray-400 mt-0.5">Shortcuts for common tasks</p>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-4 grid grid-cols-2 gap-2 content-start">
        {actions.map((a) => (
          <button
            key={a.label}
            onClick={() => navigate(a.path)}
            className="flex items-center gap-3 px-3 py-3 rounded-xl border border-gray-100 hover:border-emerald-200 hover:shadow-sm hover:bg-emerald-50/40 transition-all duration-200 cursor-pointer text-left"
          >
            <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${a.iconBg} flex items-center justify-center flex-shrink-0`}>
              <i className={`${a.icon} ${a.iconColor} text-base`}></i>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-gray-800 whitespace-nowrap">{a.label}</p>
              <p className="text-xs text-gray-400 mt-0.5 leading-tight truncate">{a.desc}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}