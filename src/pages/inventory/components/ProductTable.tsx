import { useState } from 'react';
import { Product } from '@/mocks/inventory';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useAuth } from '@/contexts/AuthContext';
import { availableStock } from '@/lib/stockReservations';

interface ProductTableProps {
  products: Product[];
  /** productId -> quantity tied up in pending requests/orders/transfers, not yet physically deducted. */
  reserved: Record<string, number>;
  onEdit: (product: Product) => void;
  onDelete: (product: Product) => void;
  onAdjust: (product: Product) => void;
  onViewHistory: (product: Product) => void;
}

const categoryColors: Record<string, string> = {
  Electronics: 'bg-sky-50 text-sky-700',
  Furniture: 'bg-amber-50 text-amber-700',
  Accessories: 'bg-violet-50 text-violet-700',
  Lighting: 'bg-yellow-50 text-yellow-700',
  'Smart Home': 'bg-teal-50 text-teal-700',
};

const statusConfig = {
  in_stock: { label: 'In Stock', cls: 'bg-emerald-50 text-emerald-700' },
  low_stock: { label: 'Low Stock', cls: 'bg-amber-50 text-amber-700' },
  out_of_stock: { label: 'Out of Stock', cls: 'bg-red-50 text-red-600' },
};

export default function ProductTable({ products, reserved, onEdit, onDelete, onAdjust, onViewHistory }: ProductTableProps) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const { formatAmount } = useCurrency();
  const { canEdit, canDelete, canAccess } = useAuth();
  const showEdit = canEdit('inventory');
  const showDelete = canDelete('inventory');
  const showAdjust = canAccess('inventory_stock_adjust');

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Product</th>
            <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">SKU</th>
            <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Category</th>
            <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Warehouse</th>
            <th className="text-right py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Stock</th>
            <th className="text-right py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Price</th>
            <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Status</th>
            <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Last Updated</th>
            <th className="py-3 px-4"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {products.map((p) => {
            const stockPct = Math.min(100, (p.stock / Math.max(p.lowStockThreshold * 4, 1)) * 100);
            const barColor = p.status === 'in_stock' ? 'bg-emerald-400' : p.status === 'low_stock' ? 'bg-amber-400' : 'bg-red-400';
            const reservedQty = reserved[p.id] || 0;
            const available = availableStock(p.stock, reserved, p.id);
            return (
              <tr key={p.id} className="hover:bg-gray-50/50 transition-colors">
                <td className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    <div className="w-16 h-16 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0 overflow-hidden">
                      {p.imageUrl ? (
                        <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" />
                      ) : (
                        <i className="ri-box-3-line text-emerald-500 text-sm"></i>
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-gray-800 leading-tight">{p.name}</p>
                      <p className="text-xs text-gray-400">{p.id}</p>
                    </div>
                  </div>
                </td>
                <td className="py-3 px-4 text-gray-500 font-mono text-xs">{p.sku}</td>
                <td className="py-3 px-4">
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${categoryColors[p.category] ?? 'bg-gray-100 text-gray-600'}`}>
                    {p.category}
                  </span>
                </td>
                <td className="py-3 px-4">
                  <div className="flex flex-col">
                    <span className="text-gray-700 text-xs font-medium">{p.warehouse}</span>
                    {p.vendor && <span className="text-gray-400 text-xs">{p.vendor}</span>}
                  </div>
                </td>
                <td className="py-3 px-4 text-right">
                  <div className="flex flex-col items-end gap-1">
                    <span className={`font-semibold ${p.stock === 0 ? 'text-red-600' : 'text-gray-800'}`}>{p.stock}</span>
                    <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${barColor}`} style={{ width: `${stockPct}%` }}></div>
                    </div>
                    <span className="text-xs text-gray-400">min {p.lowStockThreshold}</span>
                    {reservedQty > 0 && (
                      <span className="text-xs text-amber-600 font-medium" title={`${reservedQty} tied up in pending requests/orders/transfers`}>
                        {available} available
                      </span>
                    )}
                  </div>
                </td>
                <td className="py-3 px-4 text-right font-medium text-gray-800">{formatAmount(p.price)}</td>
                <td className="py-3 px-4">
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${statusConfig[p.status].cls}`}>
                    {statusConfig[p.status].label}
                  </span>
                </td>
                <td className="py-3 px-4 text-xs text-gray-400 whitespace-nowrap">{p.lastUpdated}</td>
                <td className="py-3 px-4 relative">
                  <div className="flex items-center gap-1">
                    {showAdjust && (
                      <button
                        onClick={() => onAdjust(p)}
                        className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-emerald-50 text-gray-400 hover:text-emerald-600 transition-colors cursor-pointer"
                        title="Adjust Stock"
                      >
                        <i className="ri-equalizer-line text-sm"></i>
                      </button>
                    )}
                    <button
                      onClick={() => onViewHistory(p)}
                      className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-sky-50 text-gray-400 hover:text-sky-600 transition-colors cursor-pointer"
                      title="View History"
                    >
                      <i className="ri-history-line text-sm"></i>
                    </button>
                    {(showEdit || showDelete) && (
                      <button
                        onClick={() => setOpenMenu(openMenu === p.id ? null : p.id)}
                        className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-400 transition-colors cursor-pointer"
                      >
                        <i className="ri-more-2-line text-sm"></i>
                      </button>
                    )}
                  </div>
                  {openMenu === p.id && (showEdit || showDelete) && (
                    <div
                      className="absolute right-4 top-10 w-36 bg-white border border-gray-100 rounded-2xl shadow-sm z-30 py-1 shadow-md"
                      onMouseLeave={() => setOpenMenu(null)}
                    >
                      {showEdit && (
                        <button
                          onClick={() => { onEdit(p); setOpenMenu(null); }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer"
                        >
                          <i className="ri-edit-line text-gray-400"></i> Edit
                        </button>
                      )}
                      {showDelete && (
                        <button
                          onClick={() => { onDelete(p); setOpenMenu(null); }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 cursor-pointer"
                        >
                          <i className="ri-delete-bin-line text-red-400"></i> Delete
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}