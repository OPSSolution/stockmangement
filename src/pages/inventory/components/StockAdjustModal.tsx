import { useState } from 'react';
import type { Product } from '@/mocks/inventory';
import type { StockHistoryEntry } from '@/mocks/stockHistory';

interface StockAdjustModalProps {
  product: Product;
  history?: StockHistoryEntry[];
  onClose: () => void;
  onAdjust: (productId: string, delta: number, type: string, note: string) => void;
}

const adjustTypes = [
  { value: 'adjustment', label: 'Manual Adjustment', icon: 'ri-equalizer-line' },
  { value: 'purchase', label: 'Stock Received', icon: 'ri-add-circle-line' },
  { value: 'return', label: 'Customer Return', icon: 'ri-arrow-go-back-line' },
  { value: 'transfer_in', label: 'Transfer In', icon: 'ri-arrow-right-down-line' },
  { value: 'transfer_out', label: 'Transfer Out', icon: 'ri-arrow-right-up-line' },
  { value: 'sale', label: 'Manual Sale', icon: 'ri-shopping-bag-3-line' },
];

// Every type except "Manual Adjustment" has an obvious direction — no need to make
// the user pick it separately. Only 'adjustment' leaves the toggle up to them.
const fixedDirection: Record<string, 'add' | 'remove' | undefined> = {
  purchase: 'add',
  return: 'add',
  transfer_in: 'add',
  transfer_out: 'remove',
  sale: 'remove',
};

const typeConfig: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  sale: { label: 'Sale', icon: 'ri-shopping-bag-3-line', color: 'text-rose-600', bg: 'bg-rose-50' },
  purchase: { label: 'Purchase', icon: 'ri-add-circle-line', color: 'text-emerald-600', bg: 'bg-emerald-50' },
  transfer_in: { label: 'Transfer In', icon: 'ri-arrow-right-down-line', color: 'text-sky-600', bg: 'bg-sky-50' },
  transfer_out: { label: 'Transfer Out', icon: 'ri-arrow-right-up-line', color: 'text-violet-600', bg: 'bg-violet-50' },
  return: { label: 'Return', icon: 'ri-arrow-go-back-line', color: 'text-amber-600', bg: 'bg-amber-50' },
  adjustment: { label: 'Adjustment', icon: 'ri-equalizer-line', color: 'text-gray-600', bg: 'bg-gray-100' },
};

export default function StockAdjustModal({ product, history, onClose, onAdjust }: StockAdjustModalProps) {
  const [activeTab, setActiveTab] = useState<'adjust' | 'history'>('adjust');
  const [adjustType, setAdjustType] = useState('adjustment');
  const [mode, setMode] = useState<'add' | 'remove'>('add');
  const [quantity, setQuantity] = useState(0);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const delta = mode === 'remove' ? -Math.abs(quantity) : Math.abs(quantity);
  const newStock = product.stock + delta;
  const safeHistory = Array.isArray(history) ? history : [];
  const productHistory = safeHistory.filter((h) => h.productId === product.id);
  const totalIn = productHistory.filter((h) => h.quantity > 0).reduce((sum, h) => sum + h.quantity, 0);
  const totalOut = productHistory.filter((h) => h.quantity < 0).reduce((sum, h) => sum + h.quantity, 0);

  const selectType = (value: string) => {
    setAdjustType(value);
    const forced = fixedDirection[value];
    if (forced) setMode(forced);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (quantity <= 0) { setError('Quantity must be greater than 0.'); return; }
    if (newStock < 0) { setError('Cannot reduce stock below 0.'); return; }
    setError('');
    onAdjust(product.id, delta, adjustType, note);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-md mx-4 shadow-xl">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <h2 className="text-base font-bold text-gray-900">Adjust Stock</h2>
            <p className="text-xs text-gray-400 mt-0.5">{product.name}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 cursor-pointer">
            <i className="ri-close-line text-lg"></i>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {/* Current stock display */}
          <div className="bg-gray-50 rounded-xl p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-400">Current Stock</p>
              <p className="text-2xl font-bold text-gray-800 mt-0.5">{product.stock} <span className="text-sm font-normal text-gray-400">units</span></p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400">After Adjustment</p>
              <p className={`text-2xl font-bold mt-0.5 ${newStock < 0 ? 'text-red-600' : newStock === 0 ? 'text-red-500' : newStock <= product.lowStockThreshold ? 'text-amber-600' : 'text-emerald-600'}`}>
                {newStock < 0 ? '—' : newStock} <span className="text-sm font-normal text-gray-400">units</span>
              </p>
            </div>
          </div>

            {/* Adjustment type */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2">Adjustment Type</label>
              <div className="grid grid-cols-3 gap-2">
                {adjustTypes.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => selectType(t.value)}
                    className={`flex flex-col items-center gap-1 px-2 py-2.5 rounded-lg border text-xs font-medium transition-all cursor-pointer ${
                      adjustType === t.value
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}
                  >
                    <i className={`${t.icon} text-base`}></i>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Direction: locked for every type except Manual Adjustment */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2">Direction</label>
              {fixedDirection[adjustType] ? (
                <div className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium ${mode === 'add' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                  <i className={mode === 'add' ? 'ri-add-line' : 'ri-subtract-line'}></i>
                  {mode === 'add' ? 'Adding Stock' : 'Removing Stock'}
                </div>
              ) : (
                <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setMode('add')}
                    className={`flex-1 py-2 text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${mode === 'add' ? 'bg-emerald-500 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
                  >
                    <i className="ri-add-line mr-1"></i>Add Stock
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('remove')}
                    className={`flex-1 py-2 text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${mode === 'remove' ? 'bg-red-500 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
                  >
                    <i className="ri-subtract-line mr-1"></i>Remove Stock
                  </button>
                </div>
              )}
            </div>

            {/* Quantity */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Quantity</label>
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value) || 0)}
                min={1}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-300"
              />
            </div>

          {/* Note */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Note (optional)</label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Reason for adjustment..."
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-300"
            />
          </div>

            {error && (
              <div className="bg-red-50 text-red-600 text-xs rounded-lg px-3 py-2 flex items-center gap-2">
                <i className="ri-error-warning-line"></i> {error}
              </div>
            )}

          {/* Sticky footer buttons */}
          <div className="flex items-center gap-3 px-6 py-4 border-t border-gray-100 flex-shrink-0">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer whitespace-nowrap">
              Cancel
            </button>
            <button type="submit" className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 transition-colors cursor-pointer whitespace-nowrap">
              Apply Adjustment
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
