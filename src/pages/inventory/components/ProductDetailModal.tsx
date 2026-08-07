import { useState } from 'react';
import type { ProductStockRow, ProductBinStock } from '@/mocks/inventory';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useAuth } from '@/contexts/AuthContext';
import { availableStock } from '@/lib/stockReservations';
import { formatDateTime } from '@/lib/formatDateTime';
import { expiryTone, formatExpiry } from '@/lib/expiry';

interface ProductDetailModalProps {
  product: ProductStockRow;
  /** productId -> quantity tied up in pending requests/orders/transfers, not yet physically deducted. */
  reserved: Record<string, number>;
  /** This product's bin split, if it's stored across more than one. */
  binRows: ProductBinStock[];
  /** Other product rows sharing this SKU, one per other warehouse they're stocked in. */
  siblings: { id: string; warehouse: string; stock: number }[];
  onClose: () => void;
  onEdit: (product: ProductStockRow) => void;
  onViewHistory: (product: ProductStockRow) => void;
  /** Swap the modal's data to this SKU's row in another warehouse — stays open. */
  onSwitchWarehouse: (warehouse: string) => void;
}

const statusConfig = {
  in_stock: { label: 'In Stock', cls: 'bg-emerald-50 text-emerald-700' },
  low_stock: { label: 'Low Stock', cls: 'bg-amber-50 text-amber-700' },
  out_of_stock: { label: 'Out of Stock', cls: 'bg-red-50 text-red-600' },
};

export default function ProductDetailModal({ product, reserved, binRows, siblings, onClose, onEdit, onViewHistory, onSwitchWarehouse }: ProductDetailModalProps) {
  const [showSiblings, setShowSiblings] = useState(false);
  const { formatAmount } = useCurrency();
  const { canEdit } = useAuth();
  const showEdit = canEdit('inventory');

  const reservedQty = reserved[product.id] || 0;
  const onHoldQty = product.onHoldStock || 0;
  const available = availableStock(product.stock, reserved, product.id, onHoldQty);
  const sc = statusConfig[product.status];
  const totalAllocated = binRows.reduce((sum, b) => sum + b.quantity, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl flex flex-col max-h-[90dvh]" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-14 h-14 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0 overflow-hidden">
              {product.imageUrl ? (
                <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
              ) : (
                <i className="ri-box-3-line text-emerald-500 text-xl"></i>
              )}
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-gray-900 truncate">{product.name}</h2>
              <p className="text-xs text-gray-400 font-mono mt-0.5">{product.id} · {product.sku}</p>
              <span className={`inline-block mt-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full ${sc.cls}`}>{sc.label}</span>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 cursor-pointer shrink-0">
            <i className="ri-close-line text-lg"></i>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          {/* Stock summary */}
          <div className="bg-gray-50 rounded-xl p-4 grid grid-cols-3 gap-3">
            <div>
              <p className="text-xs text-gray-400">On Hand</p>
              <p className={`text-xl font-bold mt-0.5 ${product.stock === 0 ? 'text-red-600' : 'text-gray-800'}`}>{product.stock}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Available</p>
              <p className="text-xl font-bold mt-0.5 text-emerald-600">{available}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Low Stock At</p>
              <p className="text-xl font-bold mt-0.5 text-gray-800">{product.lowStockThreshold}</p>
            </div>
            {(reservedQty > 0 || onHoldQty > 0) && (
              <div className="col-span-3 pt-2 border-t border-gray-200 flex items-center gap-4 text-xs text-amber-700">
                {reservedQty > 0 && <span><i className="ri-time-line mr-1"></i>{reservedQty} reserved (pending requests/orders/transfers)</span>}
                {onHoldQty > 0 && <span><i className="ri-forbid-2-line mr-1"></i>{onHoldQty} on hold (unusable)</span>}
              </div>
            )}
          </div>

          {/* Key details */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div>
              <p className="text-xs text-gray-400">Category</p>
              <p className="text-gray-800 font-medium mt-0.5">{product.category}</p>
            </div>
            <div className="relative">
              <p className="text-xs text-gray-400">Warehouse</p>
              <p className="text-gray-800 font-medium mt-0.5">{product.warehouse}</p>
              {siblings.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowSiblings((v) => !v)}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-600 hover:text-sky-700 cursor-pointer mt-0.5"
                  >
                    <i className="ri-building-2-line"></i>
                    +{siblings.length} other warehouse{siblings.length > 1 ? 's' : ''}
                  </button>
                  {showSiblings && (
                    <div
                      className="absolute left-0 top-full mt-1 z-20 w-56 bg-white border border-gray-100 rounded-xl shadow-md py-1"
                      onMouseLeave={() => setShowSiblings(false)}
                    >
                      <p className="px-3 py-1.5 text-[11px] text-gray-400 uppercase tracking-wide">Same SKU, other warehouses</p>
                      {siblings.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => { onSwitchWarehouse(s.warehouse); setShowSiblings(false); }}
                          className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 cursor-pointer text-left"
                        >
                          <span className="truncate">{s.warehouse}</span>
                          <span className="text-gray-400 flex-shrink-0">{s.stock} on hand</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
            <div>
              <p className="text-xs text-gray-400">Vendor</p>
              <p className="text-gray-800 font-medium mt-0.5">{product.vendor || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Product Type</p>
              <p className="text-gray-800 font-medium mt-0.5 capitalize">{product.productType}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Price</p>
              <p className="text-gray-800 font-medium mt-0.5">{formatAmount(product.price)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">{binRows.length > 1 ? 'Nearest Expiry' : 'Expiry Date'}</p>
              <p className={`font-medium mt-0.5 ${product.expiryDate ? expiryTone(product.expiryDate) : 'text-gray-800'}`}>
                {product.expiryDate ? new Date(product.expiryDate).toLocaleDateString() : '—'}
              </p>
            </div>
            <div className="col-span-2">
              <p className="text-xs text-gray-400">Last Updated</p>
              <p className="text-gray-800 font-medium mt-0.5">{formatDateTime(product.lastUpdated)}</p>
            </div>
          </div>

          {/* Bin locations */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Bin Locations</p>
              {binRows.length > 0 && (
                <span className={`text-[11px] font-medium ${totalAllocated === product.stock ? 'text-emerald-600' : 'text-amber-600'}`}>
                  Allocated {totalAllocated} / {product.stock}
                </span>
              )}
            </div>
            {binRows.length > 0 ? (
              <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
                {binRows.map((b) => (
                  <div key={b.id} className="flex items-center justify-between px-3 py-2">
                    <div>
                      <span className="text-sm font-mono text-gray-700"><i className="ri-map-pin-2-line mr-1.5 text-gray-400"></i>{b.binLocation}</span>
                      {b.expiryDate && (
                        <p className={`text-[11px] mt-0.5 pl-5 ${expiryTone(b.expiryDate)}`}>Exp {formatExpiry(b.expiryDate)}</p>
                      )}
                    </div>
                    <span className="text-sm font-semibold text-gray-800">{b.quantity}</span>
                  </div>
                ))}
              </div>
            ) : product.binLocation ? (
              <div className="border border-gray-200 rounded-lg px-3 py-2 flex items-center justify-between">
                <span className="text-sm font-mono text-gray-700"><i className="ri-map-pin-2-line mr-1.5 text-gray-400"></i>{product.binLocation}</span>
                <span className="text-sm font-semibold text-gray-800">{product.stock}</span>
              </div>
            ) : (
              <p className="text-xs text-gray-400 italic">No bin assigned yet — set one from Edit Product.</p>
            )}
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center gap-2 px-6 py-4 border-t border-gray-100 shrink-0">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer whitespace-nowrap">
            Close
          </button>
          <button onClick={() => onViewHistory(product)} className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium text-sky-700 bg-sky-50 rounded-lg hover:bg-sky-100 transition-colors cursor-pointer whitespace-nowrap">
            <i className="ri-history-line"></i> History
          </button>
          {showEdit && (
            <button onClick={() => onEdit(product)} className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 transition-colors cursor-pointer whitespace-nowrap">
              <i className="ri-edit-line"></i> Edit
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
