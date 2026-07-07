import { useNavigate } from 'react-router-dom';
import type { Warehouse } from '@/mocks/warehouses';

interface Props {
  warehouse: Warehouse;
  onDelete?: () => void;
}

export default function WarehouseCard({ warehouse, onDelete }: Props) {
  const navigate = useNavigate();
  const usagePct = Math.round((warehouse.usedCapacity / warehouse.totalCapacity) * 100);
  const usageColor = usagePct >= 85 ? 'bg-red-400' : usagePct >= 65 ? 'bg-amber-400' : 'bg-emerald-500';

  return (
    <div
      onClick={() => navigate(`/warehouses/${warehouse.id}`)}
      className="w-full text-left bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md hover:border-emerald-200 hover:-translate-y-0.5 transition-all duration-200 cursor-pointer"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${warehouse.type === 'owned' ? 'bg-emerald-100' : 'bg-violet-100'}`}>
            <i className={`ri-building-2-line text-lg ${warehouse.type === 'owned' ? 'text-emerald-600' : 'text-violet-600'}`}></i>
          </div>
          <div>
            <p className="font-bold text-gray-900 tracking-tight">{warehouse.name}</p>
            <p className="text-xs text-gray-500 mt-0.5">{warehouse.city}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${warehouse.type === 'owned' ? 'bg-emerald-50 text-emerald-700' : 'bg-violet-50 text-violet-700'} whitespace-nowrap`}>
            {warehouse.type === 'owned' ? 'Owned' : 'Vendor'}
          </span>
          {onDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors cursor-pointer"
              title="Delete warehouse"
            >
              <i className="ri-delete-bin-line text-sm"></i>
            </button>
          )}
          <i className="ri-arrow-right-s-line text-gray-300 text-lg"></i>
        </div>
      </div>

      {/* Capacity Bar */}
      <div className="mb-4">
        <div className="flex justify-between text-xs text-gray-500 mb-1.5">
          <span>Storage Capacity</span>
          <span className={`font-semibold ${usagePct >= 85 ? 'text-red-500' : usagePct >= 65 ? 'text-amber-600' : 'text-emerald-600'}`}>{usagePct}%</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2">
          <div className={`${usageColor} h-2 rounded-full transition-all`} style={{ width: `${usagePct}%` }}></div>
        </div>
        <div className="flex justify-between text-xs text-gray-400 mt-1">
          <span>{warehouse.usedCapacity.toLocaleString()} used</span>
          <span>{warehouse.totalCapacity.toLocaleString()} total</span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-gray-50 rounded-lg py-2">
          <p className="text-base font-bold text-gray-900">{warehouse.totalSkus}</p>
          <p className="text-xs text-gray-500">SKUs</p>
        </div>
        <div className="bg-gray-50 rounded-lg py-2">
          <p className="text-base font-bold text-gray-900">{warehouse.totalUnits.toLocaleString()}</p>
          <p className="text-xs text-gray-500">Units</p>
        </div>
        <div className="bg-gray-50 rounded-lg py-2">
          <p className="text-base font-bold text-emerald-600">{warehouse.inboundToday}</p>
          <p className="text-xs text-gray-500">In Today</p>
        </div>
      </div>
    </div>
  );
}
