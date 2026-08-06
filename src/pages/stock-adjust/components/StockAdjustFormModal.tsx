import { useState } from 'react';
import type { ProductStockRow, ProductBinStock } from '@/mocks/inventory';
import BinCombobox from '@/components/feature/BinCombobox';
import { buildReceiveBinOptions, lowestQuantityBin, binExpiry, binStockKey } from '@/lib/binStock';

export interface AdjustLine {
  /** `${productId}::${warehouse}` — one line per product+warehouse in the batch. */
  key: string;
  product: ProductStockRow;
  mode: 'add' | 'remove';
  quantity: number;
  binLocation: string;
  expiryDate: string;
}

interface StockAdjustFormModalProps {
  products: ProductStockRow[];
  binStockByProduct: Record<string, ProductBinStock[]>;
  warehouseBinsByName: Record<string, string[]>;
  /** Pre-seeds the batch with one product (e.g. opened from a table row) — the picker
   * still lets more warehouses/products be added on top of it. */
  initialProduct?: ProductStockRow | null;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (lines: AdjustLine[], note: string) => void;
}

function makeLine(p: ProductStockRow, binStockByProduct: Record<string, ProductBinStock[]>): AdjustLine {
  const key = binStockKey(p.id, p.warehouse);
  const bins = (binStockByProduct[key] ?? []).map((b) => ({ bin_location: b.binLocation, quantity: b.quantity, expiry_date: b.expiryDate }));
  const defaultBin = bins.length > 0 ? lowestQuantityBin(bins) : '';
  const defaultExpiry = (defaultBin && binExpiry(bins, defaultBin)) || '';
  return { key, product: p, mode: 'add', quantity: 1, binLocation: defaultBin, expiryDate: defaultExpiry };
}

export default function StockAdjustFormModal({ products, binStockByProduct, warehouseBinsByName, initialProduct, submitting, onClose, onSubmit }: StockAdjustFormModalProps) {
  const [lines, setLines] = useState<AdjustLine[]>(initialProduct ? [makeLine(initialProduct, binStockByProduct)] : []);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const [pickerWarehouse, setPickerWarehouse] = useState(initialProduct?.warehouse ?? '');
  const [pickerProduct, setPickerProduct] = useState('');

  const warehouseOptions = [...new Set(products.map((p) => p.warehouse))].sort();

  // One line per product+warehouse — already-added combos drop out of the picker.
  const pickerProducts = pickerWarehouse
    ? products.filter((p) => p.warehouse === pickerWarehouse && !lines.some((l) => l.key === binStockKey(p.id, p.warehouse)))
    : [];

  const updateLine = (key: string, patch: Partial<AdjustLine>) => {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };

  const removeLine = (key: string) => setLines((prev) => prev.filter((l) => l.key !== key));

  const handleAddLine = () => {
    const product = products.find((p) => p.id === pickerProduct && p.warehouse === pickerWarehouse);
    if (!product) return;
    setLines((prev) => [...prev, makeLine(product, binStockByProduct)]);
    setPickerProduct('');
    setError('');
  };

  const handleSubmit = () => {
    if (lines.length === 0) { setError('Add at least one product to the batch.'); return; }
    for (const line of lines) {
      const bins = binStockByProduct[line.key] ?? [];
      const quantity = Number(line.quantity) || 0;
      if (quantity <= 0) { setError(`Enter a quantity for "${line.product.name}".`); return; }
      if (line.mode === 'remove' && quantity > line.product.stock) {
        setError(`Cannot remove ${quantity} of "${line.product.name}" — only ${line.product.stock} on hand.`);
        return;
      }
      if (line.mode === 'add' && bins.length > 0 && !line.binLocation.trim()) {
        setError(`Select or enter a bin for "${line.product.name}".`);
        return;
      }
      if (line.mode === 'remove' && bins.length > 1 && !line.binLocation) {
        setError(`Select which bin to remove "${line.product.name}" from.`);
        return;
      }
    }
    setError('');
    onSubmit(lines, note);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-base font-bold text-gray-900">Create Stock Adjustment</h2>
            <p className="text-xs text-gray-400 mt-0.5">Select a warehouse, then a product, then add it to the batch below.</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 cursor-pointer">
            <i className="ri-close-line text-lg"></i>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Picker — select warehouse, then product, then Add */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Add a Product</p>
            <div className="flex gap-2 flex-wrap">
              <select
                value={pickerWarehouse}
                onChange={(e) => { setPickerWarehouse(e.target.value); setPickerProduct(''); }}
                className="w-40 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 cursor-pointer"
              >
                <option value="">Warehouse</option>
                {warehouseOptions.map((w) => <option key={w} value={w}>{w}</option>)}
              </select>
              <select
                value={pickerProduct}
                onChange={(e) => setPickerProduct(e.target.value)}
                disabled={!pickerWarehouse}
                className="flex-1 min-w-40 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 cursor-pointer disabled:bg-gray-50 disabled:text-gray-400"
              >
                <option value="">{pickerWarehouse ? 'Select product' : 'Select warehouse first'}</option>
                {pickerProducts.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku}) — {p.stock} on hand</option>)}
              </select>
              <button
                type="button"
                onClick={handleAddLine}
                disabled={!pickerProduct}
                className="px-4 py-2.5 bg-emerald-500 text-white text-sm font-medium rounded-lg hover:bg-emerald-600 disabled:opacity-40 transition-colors cursor-pointer whitespace-nowrap"
              >
                <i className="ri-add-line mr-1"></i>Add to Batch
              </button>
            </div>
          </div>

          {/* Batch lines */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Batch {lines.length > 0 ? `(${lines.length})` : ''}</p>
            {lines.length === 0 ? (
              <div className="border border-dashed border-gray-200 rounded-lg py-6 text-center text-sm text-gray-400">
                No products added yet
              </div>
            ) : (
              <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 overflow-hidden">
                {lines.map((line) => {
                  const bins = binStockByProduct[line.key] ?? [];
                  const addBinOptions = buildReceiveBinOptions(
                    bins.map((b) => ({ bin_location: b.binLocation, quantity: b.quantity, expiry_date: b.expiryDate })),
                    warehouseBinsByName[line.product.warehouse]
                  );
                  return (
                    <div key={line.key} className="p-3 space-y-2.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0 overflow-hidden">
                          {line.product.imageUrl ? (
                            <img src={line.product.imageUrl} alt={line.product.name} className="w-full h-full object-cover" />
                          ) : (
                            <i className="ri-box-3-line text-emerald-500 text-xs"></i>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-800 truncate">{line.product.name}</p>
                          <p className="text-xs text-gray-400">{line.product.sku} · {line.product.warehouse} · {line.product.stock} on hand</p>
                        </div>
                        <button type="button" onClick={() => removeLine(line.key)} className="w-7 h-7 flex items-center justify-center rounded hover:bg-red-50 text-gray-400 hover:text-red-500 cursor-pointer shrink-0">
                          <i className="ri-delete-bin-line text-sm"></i>
                        </button>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 pl-[42px]">
                        {/* Direction */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => updateLine(line.key, { mode: 'add' })}
                            className={`px-2.5 py-1.5 text-xs font-medium rounded-md border cursor-pointer transition-colors ${line.mode === 'add' ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}
                          >
                            <i className="ri-add-line"></i> Add
                          </button>
                          <button
                            type="button"
                            onClick={() => updateLine(line.key, { mode: 'remove' })}
                            className={`px-2.5 py-1.5 text-xs font-medium rounded-md border cursor-pointer transition-colors ${line.mode === 'remove' ? 'border-red-300 bg-red-50 text-red-600' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}
                          >
                            <i className="ri-subtract-line"></i> Remove
                          </button>
                        </div>

                        {/* Bin */}
                        <div className="w-36 shrink-0">
                          {line.mode === 'add' && addBinOptions.length > 0 ? (
                            <BinCombobox options={addBinOptions} value={line.binLocation} onChange={(v) => updateLine(line.key, { binLocation: v })} placeholder="Bin…" />
                          ) : line.mode === 'remove' && bins.length > 0 ? (
                            <select
                              value={line.binLocation}
                              onChange={(e) => updateLine(line.key, { binLocation: e.target.value })}
                              className="w-full px-2.5 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200 cursor-pointer"
                            >
                              <option value="">Select bin…</option>
                              {[...bins].sort((a, b) => a.quantity - b.quantity).map((b) => (
                                <option key={b.id} value={b.binLocation}>{b.binLocation} ({b.quantity})</option>
                              ))}
                            </select>
                          ) : (
                            <input value={line.product.binLocation || '—'} readOnly disabled className="w-full px-2.5 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 text-gray-400" />
                          )}
                        </div>

                        {/* Quantity */}
                        <input
                          type="number"
                          min={1}
                          value={line.quantity === 0 ? '' : line.quantity}
                          onChange={(e) => { const v = e.target.value; updateLine(line.key, { quantity: v === '' ? 0 : Math.max(0, Number(v) || 0) }); }}
                          placeholder="Qty"
                          className="w-20 px-2.5 py-2 text-sm text-center border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200 shrink-0"
                        />

                        {/* Expiry (add mode only) */}
                        {line.mode === 'add' && (
                          <input
                            type="date"
                            value={line.expiryDate}
                            onChange={(e) => updateLine(line.key, { expiryDate: e.target.value })}
                            title="Expiry date for this bin (optional)"
                            className="w-36 px-2.5 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200 shrink-0"
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note for this batch (optional) — applied to every line"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200"
          />

          {error && (
            <div className="bg-red-50 text-red-600 text-xs rounded-lg px-3 py-2 flex items-center gap-2">
              <i className="ri-error-warning-line"></i> {error}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 shrink-0 flex items-center justify-between">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex items-center gap-1.5 px-5 py-2.5 text-sm font-semibold text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            <i className={submitting ? 'ri-loader-4-line animate-spin' : 'ri-check-double-line'}></i>
            {submitting ? 'Applying…' : `Apply ${lines.length || ''} Adjustment${lines.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  );
}
