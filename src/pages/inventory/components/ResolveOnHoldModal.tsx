import { useState } from 'react';
import type { Product } from '@/mocks/inventory';
import type { OnHoldResolution } from '@/lib/stockDeduction';

interface ResolveOnHoldModalProps {
  product: Product;
  onClose: () => void;
  onResolve: (quantity: number, resolution: OnHoldResolution, note: string) => void;
  resolving: boolean;
  error: string;
}

export default function ResolveOnHoldModal({ product, onClose, onResolve, resolving, error }: ResolveOnHoldModalProps) {
  const onHoldStock = product.onHoldStock || 0;
  const [resolution, setResolution] = useState<OnHoldResolution>('release');
  const [quantity, setQuantity] = useState(onHoldStock);
  const [note, setNote] = useState('');
  const [localError, setLocalError] = useState('');

  const remainingOnHold = Math.max(0, onHoldStock - quantity);
  const newStock = resolution === 'discard' ? product.stock - quantity : product.stock;

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (quantity <= 0) { setLocalError('Quantity must be greater than 0.'); return; }
    if (quantity > onHoldStock) { setLocalError(`Only ${onHoldStock} unit(s) on hold.`); return; }
    setLocalError('');
    onResolve(quantity, resolution, note);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl flex flex-col max-h-[90dvh]">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-gray-900">Resolve On Hold Stock</h2>
            <p className="text-xs text-gray-400 mt-0.5">{product.name}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 cursor-pointer">
            <i className="ri-close-line text-lg"></i>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
            <div className="bg-orange-50 rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-400">On Hold</p>
                <p className="text-2xl font-bold text-orange-600 mt-0.5">{onHoldStock} <span className="text-sm font-normal text-gray-400">units</span></p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-400">After Resolving</p>
                <p className="text-2xl font-bold text-gray-800 mt-0.5">{remainingOnHold} <span className="text-sm font-normal text-gray-400">units</span></p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2">Resolution</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setResolution('release')}
                  className={`flex flex-col items-center gap-1 px-3 py-3 rounded-lg border text-xs font-medium transition-all cursor-pointer ${
                    resolution === 'release' ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  <i className="ri-checkbox-circle-line text-base"></i>
                  Release to Available
                </button>
                <button
                  type="button"
                  onClick={() => setResolution('discard')}
                  className={`flex flex-col items-center gap-1 px-3 py-3 rounded-lg border text-xs font-medium transition-all cursor-pointer ${
                    resolution === 'discard' ? 'border-red-300 bg-red-50 text-red-600' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  <i className="ri-delete-bin-line text-base"></i>
                  Discard (Write Off)
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                {resolution === 'release'
                  ? 'Inspection found these units are fine after all — moves them back into available stock.'
                  : `Removes these units from stock entirely. Total stock will drop to ${Math.max(0, newStock)}.`}
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Quantity</label>
              <input
                type="number"
                value={quantity === 0 ? '' : quantity}
                onChange={(e) => {
                  const val = e.target.value;
                  setQuantity(val === '' ? 0 : Math.max(0, Number(val) || 0));
                }}
                min={1}
                max={onHoldStock}
                placeholder="0"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-300"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Note (optional)</label>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Reason for resolving..."
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-300"
              />
            </div>

            {(localError || error) && (
              <div className="bg-red-50 text-red-600 text-xs rounded-lg px-3 py-2 flex items-center gap-2">
                <i className="ri-error-warning-line"></i> {localError || error}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 px-6 py-4 border-t border-gray-100 flex-shrink-0">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer whitespace-nowrap">
              Cancel
            </button>
            <button
              type="submit"
              disabled={resolving}
              className={`flex-1 px-4 py-2.5 text-sm font-medium text-white rounded-lg transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed ${
                resolution === 'discard' ? 'bg-red-500 hover:bg-red-600' : 'bg-emerald-500 hover:bg-emerald-600'
              }`}
            >
              {resolving ? 'Resolving…' : resolution === 'discard' ? 'Discard Units' : 'Release Units'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
