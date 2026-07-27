import { useState } from 'react';
import type { Product, ProductBinStock } from '@/mocks/inventory';
import type { StockHistoryEntry } from '@/mocks/stockHistory';

interface StockAdjustModalProps {
  product: Product;
  history?: StockHistoryEntry[];
  /** This product's current bin split, if it's stored across more than one. */
  binRows?: ProductBinStock[];
  onClose: () => void;
  onAdjust: (productId: string, delta: number, type: string, note: string, expiryDate?: string, binLocation?: string) => void;
}

const adjustTypes = [
  { value: 'purchase', label: 'Stock Received', icon: 'ri-add-circle-line' },
  { value: 'return', label: 'Customer Return', icon: 'ri-arrow-go-back-line' },
  { value: 'transfer_in', label: 'Transfer In', icon: 'ri-arrow-right-down-line' },
  { value: 'transfer_out', label: 'Transfer Out', icon: 'ri-arrow-right-up-line' },
  { value: 'sale', label: 'Manual Sale', icon: 'ri-shopping-bag-3-line' },
];

// Every type here has an obvious direction, so it's never left up to the user to pick.
const fixedDirection: Record<string, 'add' | 'remove'> = {
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

export default function StockAdjustModal({ product, history, binRows, onClose, onAdjust }: StockAdjustModalProps) {
  const [activeTab, setActiveTab] = useState<'adjust' | 'history'>('adjust');
  const [adjustType, setAdjustType] = useState('purchase');
  const [quantity, setQuantity] = useState(0);
  const [selectedBin, setSelectedBin] = useState(() => (binRows && binRows.length === 1 ? binRows[0].binLocation : ''));
  const [note, setNote] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [error, setError] = useState('');

  const mode = fixedDirection[adjustType];
  const delta = mode === 'remove' ? -Math.abs(quantity) : Math.abs(quantity);
  const newStock = product.stock + delta;
  const safeHistory = Array.isArray(history) ? history : [];
  const productHistory = safeHistory.filter((h) => h.productId === product.id);
  const totalIn = productHistory.filter((h) => h.quantity > 0).reduce((sum, h) => sum + h.quantity, 0);
  const totalOut = productHistory.filter((h) => h.quantity < 0).reduce((sum, h) => sum + h.quantity, 0);

  const hasMultipleBins = (binRows?.length ?? 0) > 1;

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (quantity <= 0) { setError('Quantity must be greater than 0.'); return; }
    if (newStock < 0) { setError('Cannot reduce stock below 0.'); return; }
    if (hasMultipleBins && !selectedBin) { setError('Select which bin this adjustment applies to.'); return; }
    setError('');
    onAdjust(product.id, delta, adjustType, note, mode === 'add' ? expiryDate || undefined : undefined, selectedBin || undefined);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl flex flex-col max-h-[90dvh]">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-gray-900">Adjust Stock</h2>
            <p className="text-xs text-gray-400 mt-0.5">{product.name}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 cursor-pointer">
            <i className="ri-close-line text-lg"></i>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
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
                    onClick={() => setAdjustType(t.value)}
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

            {/* Direction is implied entirely by the selected type */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2">Direction</label>
              <div className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium ${mode === 'add' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                <i className={mode === 'add' ? 'ri-add-line' : 'ri-subtract-line'}></i>
                {mode === 'add' ? 'Adding Stock' : 'Removing Stock'}
              </div>
            </div>

            {/* Warehouse & bin location — informational only, not editable here */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Warehouse</label>
                <input
                  value={product.warehouse}
                  readOnly
                  disabled
                  tabIndex={-1}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Bin Location</label>
                {hasMultipleBins ? (
                  <select
                    value={selectedBin}
                    onChange={(e) => setSelectedBin(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200 cursor-pointer"
                  >
                    <option value="">Select bin…</option>
                    {binRows!.map((b) => (
                      <option key={b.id} value={b.binLocation}>{b.binLocation} ({b.quantity} on hand)</option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={binRows?.[0]?.binLocation || product.binLocation || '—'}
                    readOnly
                    disabled
                    tabIndex={-1}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed"
                  />
                )}
              </div>
            </div>

            {/* Quantity */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Quantity</label>
              <input
                type="number"
                value={quantity === 0 ? '' : quantity}
                onChange={(e) => {
                  // Don't force a fallback to 0 while typing — with the field starting
                  // at 0, that snaps the value back on every keystroke (e.g. while
                  // backspacing to clear it) and fights the user's typing.
                  const val = e.target.value;
                  setQuantity(val === '' ? 0 : Math.max(0, Number(val) || 0));
                }}
                min={1}
                placeholder="0"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-300"
              />
            </div>

            {/* Expiry date — only meaningful when stock is coming in */}
            {mode === 'add' && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Expiry Date (optional)</label>
                <input
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-300"
                />
              </div>
            )}

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
        </div>

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
