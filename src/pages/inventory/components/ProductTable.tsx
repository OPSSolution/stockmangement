import { useState } from 'react';
import { Product, ProductBinStock } from '@/mocks/inventory';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useAuth } from '@/contexts/AuthContext';
import { availableStock } from '@/lib/stockReservations';
import { formatDateTime } from '@/lib/formatDateTime';
import { expiryTone } from '@/lib/expiry';

interface ProductTableProps {
  products: Product[];
  /** productId -> quantity tied up in pending requests/orders/transfers, not yet physically deducted. */
  reserved: Record<string, number>;
  /** productId -> its bin split, when stock is spread across more than one bin. */
  binStockByProduct: Record<string, ProductBinStock[]>;
  /** sku -> every product row with that SKU (across all warehouses, unfiltered) — used to flag when
   * the same SKU also exists in other warehouses as a separate row. */
  siblingsBySku: Record<string, { id: string; warehouse: string; stock: number }[]>;
  /** Jump the table to a given warehouse, clearing other filters so the row is guaranteed visible. */
  onJumpToWarehouse: (warehouse: string) => void;
  onEdit: (product: Product) => void;
  onDelete: (product: Product) => void;
  onAdjust: (product: Product) => void;
  onViewHistory: (product: Product) => void;
  onViewDetails: (product: Product) => void;
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

export default function ProductTable({ products, reserved, binStockByProduct, siblingsBySku, onJumpToWarehouse, onEdit, onDelete, onAdjust, onViewHistory, onViewDetails }: ProductTableProps) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [openSiblingMenu, setOpenSiblingMenu] = useState<string | null>(null);
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
            <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Bin</th>
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
            const onHoldQty = p.onHoldStock || 0;
            const available = availableStock(p.stock, reserved, p.id, onHoldQty);
            const siblings = (siblingsBySku[p.sku] || []).filter((s) => s.id !== p.id);
            return (
              <tr key={p.id} className="hover:bg-gray-50/50 transition-colors">
                <td className="py-3 px-4">
                  <button
                    type="button"
                    onClick={() => onViewDetails(p)}
                    className="flex items-center gap-3 text-left cursor-pointer group"
                    title="View product details"
                  >
                    <div className="w-16 h-16 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0 overflow-hidden">
                      {p.imageUrl ? (
                        <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" />
                      ) : (
                        <i className="ri-box-3-line text-emerald-500 text-sm"></i>
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-gray-800 leading-tight group-hover:text-emerald-600 group-hover:underline transition-colors">{p.name}</p>
                      <p className="text-xs text-gray-400">{p.id}</p>
                      {p.expiryDate && (
                        <p className={`text-xs mt-0.5 ${expiryTone(p.expiryDate)}`}>
                          <i className="ri-calendar-close-line mr-0.5"></i>Exp {new Date(p.expiryDate).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </button>
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
                    {siblings.length > 0 && (
                      <div className="relative mt-1">
                        <button
                          type="button"
                          onClick={() => setOpenSiblingMenu(openSiblingMenu === p.id ? null : p.id)}
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-600 hover:text-sky-700 cursor-pointer"
                        >
                          <i className="ri-building-2-line"></i>
                          +{siblings.length} other warehouse{siblings.length > 1 ? 's' : ''}
                        </button>
                        {openSiblingMenu === p.id && (
                          <div
                            className="absolute left-0 top-6 z-20 w-56 bg-white border border-gray-100 rounded-xl shadow-md py-1"
                            onMouseLeave={() => setOpenSiblingMenu(null)}
                          >
                            <p className="px-3 py-1.5 text-[11px] text-gray-400 uppercase tracking-wide">Same SKU, other warehouses</p>
                            {siblings.map((s) => (
                              <button
                                key={s.id}
                                type="button"
                                onClick={() => { onJumpToWarehouse(s.warehouse); setOpenSiblingMenu(null); }}
                                className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 cursor-pointer text-left"
                              >
                                <span className="truncate">{s.warehouse}</span>
                                <span className="text-gray-400 flex-shrink-0">{s.stock} in stock</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </td>
                <td className="py-3 px-4">
                  {(() => {
                    const bins = binStockByProduct[p.id] ?? [];
                    if (bins.length > 0) {
                      return (
                        <div className="flex flex-col gap-0.5">
                          {[...bins].sort((a, b) => b.quantity - a.quantity).map((b) => (
                            <span key={b.id} className="text-xs text-gray-600 whitespace-nowrap">
                              <i className="ri-map-pin-2-line mr-1 text-gray-400"></i>
                              {b.binLocation} <span className="text-gray-400">×{b.quantity}</span>
                            </span>
                          ))}
                        </div>
                      );
                    }
                    if (p.binLocation) {
                      return (
                        <span className="text-xs text-gray-600 whitespace-nowrap">
                          <i className="ri-map-pin-2-line mr-1 text-gray-400"></i>
                          {p.binLocation} <span className="text-gray-400">×{p.stock}</span>
                        </span>
                      );
                    }
                    return <span className="text-xs text-gray-300">—</span>;
                  })()}
                </td>
                <td className="py-3 px-4 text-right">
                  <div className="flex flex-col items-end gap-1">
                    <span className={`font-semibold ${p.stock === 0 ? 'text-red-600' : 'text-gray-800'}`}>{p.stock}</span>
                    <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${barColor}`} style={{ width: `${stockPct}%` }}></div>
                    </div>
                    <span className="text-xs text-gray-400">min {p.lowStockThreshold}</span>
                    {(reservedQty > 0 || onHoldQty > 0) && (
                      <span className="text-xs text-amber-600 font-medium" title={`${reservedQty} tied up in pending requests/orders/transfers${onHoldQty > 0 ? `, ${onHoldQty} on hold (unusable)` : ''}`}>
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
                <td className="py-3 px-4 text-xs text-gray-400 whitespace-nowrap">{formatDateTime(p.lastUpdated)}</td>
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