import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { PromotionType } from '@/mocks/promotions';
import { useCurrency } from '@/contexts/CurrencyContext';

interface FormData {
  name: string;
  type: PromotionType;
  description: string;
  discountValue: number;
  minOrderAmount: number;
  maxUsageCount: number;
  startDate: string;
  endDate: string;
  productIds: string[];
  bundlePrice: number;
  buyQty: number;
  getQty: number;
}

interface Props {
  onClose: () => void;
  onSubmit: (data: FormData) => void;
}

interface ProductOption {
  id: string;
  name: string;
  sku: string;
  image_url?: string | null;
  price: number;
  stock: number;
}

const typeOptions: { value: PromotionType; label: string; icon: string; desc: string }[] = [
  { value: 'percentage', label: 'Percentage Off', icon: 'ri-percent-line', desc: '% discount on selected products' },
  { value: 'fixed_amount', label: 'Fixed Amount Off', icon: 'ri-price-tag-3-line', desc: 'Fixed $ amount off on selected products' },
  { value: 'buy_x_get_y', label: 'Buy X Get Y', icon: 'ri-gift-line', desc: 'Buy X units, get Y units free' },
  { value: 'bundle', label: 'Bundle Deal', icon: 'ri-archive-2-line', desc: 'Fixed bundle price for multiple products' },
];

export default function PromotionFormModal({ onClose, onSubmit }: Props) {
  const { formatAmount } = useCurrency();
  const [form, setForm] = useState<FormData>({
    name: '',
    type: 'percentage',
    description: '',
    discountValue: 10,
    minOrderAmount: 0,
    maxUsageCount: 0,
    startDate: '',
    endDate: '',
    productIds: [],
    bundlePrice: 0,
    buyQty: 2,
    getQty: 1,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('products').select('id, name, sku, image_url, price, stock');
    if (error) console.error(error);
    else setProducts((data || []).map((p) => ({ id: p.id, name: p.name, sku: p.sku, image_url: p.image_url, price: p.price, stock: p.stock })));
    setLoading(false);
  };

  const toggleProduct = (id: string) => {
    setForm((f) => ({
      ...f,
      productIds: f.productIds.includes(id) ? f.productIds.filter((p) => p !== id) : [...f.productIds, id],
    }));
  };

  const selectedProducts = products.filter((p) => form.productIds.includes(p.id));
  const originalTotal = selectedProducts.reduce((s, p) => s + p.price, 0);
  let discountedTotal = originalTotal;
  if (form.type === 'percentage') discountedTotal = originalTotal * (1 - form.discountValue / 100);
  else if (form.type === 'fixed_amount') discountedTotal = Math.max(0, originalTotal - form.discountValue);
  else if (form.type === 'bundle') discountedTotal = form.bundlePrice;

  const stockImpactDays = form.type === 'buy_x_get_y'
    ? selectedProducts.map((p) => ({ name: p.name, stock: p.stock, dailyImpact: Math.ceil((form.buyQty + form.getQty) * 2) }))
    : selectedProducts.map((p) => ({ name: p.name, stock: p.stock, dailyImpact: Math.ceil(p.stock * 0.08) }));

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = 'Name is required.';
    if (!form.startDate) e.startDate = 'Start date required.';
    if (!form.endDate) e.endDate = 'End date required.';
    if (form.startDate && form.endDate && form.startDate > form.endDate) e.endDate = 'End date must be after start.';
    if (form.productIds.length === 0) e.products = 'Select at least one product.';
    if (form.discountValue <= 0 && form.type !== 'bundle' && form.type !== 'buy_x_get_y') e.discountValue = 'Discount value must be greater than 0.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = () => {
    if (validate()) onSubmit(form);
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-lg" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Create Promotion</h2>
            <p className="text-sm text-gray-500 mt-0.5">Set up a new discount rule or bundle offer</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 cursor-pointer">
            <i className="ri-close-line text-gray-500"></i>
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Name */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1.5">Promotion Name *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Summer Tech Sale — 20% Off"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 placeholder-gray-400"
            />
            {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
          </div>

          {/* Promotion Type */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-2">Promotion Type *</label>
            <div className="grid grid-cols-2 gap-2">
              {typeOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setForm((f) => ({ ...f, type: opt.value }))}
                  className={`flex items-center gap-3 p-3 rounded-lg border text-left cursor-pointer transition-all ${form.type === opt.value ? 'border-emerald-400 bg-emerald-50 ring-1 ring-emerald-300' : 'border-gray-200 hover:border-gray-300'}`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${form.type === opt.value ? 'bg-emerald-100' : 'bg-gray-100'}`}>
                    <i className={`${opt.icon} text-sm ${form.type === opt.value ? 'text-emerald-600' : 'text-gray-500'}`}></i>
                  </div>
                  <div>
                    <p className={`text-sm font-medium ${form.type === opt.value ? 'text-emerald-800' : 'text-gray-700'}`}>{opt.label}</p>
                    <p className="text-xs text-gray-400">{opt.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Discount Value */}
          {form.type !== 'bundle' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">
                  {form.type === 'percentage' ? 'Discount (%)' : form.type === 'fixed_amount' ? 'Discount Amount ($)' : form.type === 'buy_x_get_y' ? 'Buy Qty' : 'Value'}
                </label>
                <input
                  type="number"
                  min={1}
                  value={form.type === 'buy_x_get_y' ? form.buyQty : form.discountValue}
                  onChange={(e) => form.type === 'buy_x_get_y'
                    ? setForm((f) => ({ ...f, buyQty: Number(e.target.value) }))
                    : setForm((f) => ({ ...f, discountValue: Number(e.target.value) }))
                  }
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
                {errors.discountValue && <p className="text-xs text-red-500 mt-1">{errors.discountValue}</p>}
              </div>
              {form.type === 'buy_x_get_y' ? (
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1.5">Get Qty (Free)</label>
                  <input
                    type="number"
                    min={1}
                    value={form.getQty}
                    onChange={(e) => setForm((f) => ({ ...f, getQty: Number(e.target.value) }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  />
                </div>
              ) : (
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1.5">Min. Order Amount (RM)</label>
                  <input
                    type="number"
                    min={0}
                    value={form.minOrderAmount}
                    onChange={(e) => setForm((f) => ({ ...f, minOrderAmount: Number(e.target.value) }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  />
                </div>
              )}
            </div>
          )}

          {form.type === 'bundle' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">Bundle Price (RM)</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={form.bundlePrice}
                  onChange={(e) => setForm((f) => ({ ...f, bundlePrice: Number(e.target.value) }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">Max Usage Count</label>
                <input
                  type="number"
                  min={0}
                  value={form.maxUsageCount}
                  onChange={(e) => setForm((f) => ({ ...f, maxUsageCount: Number(e.target.value) }))}
                  placeholder="0 = unlimited"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 placeholder-gray-400"
                />
              </div>
            </div>
          )}

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1.5">Start Date *</label>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 cursor-pointer"
              />
              {errors.startDate && <p className="text-xs text-red-500 mt-1">{errors.startDate}</p>}
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1.5">End Date *</label>
              <input
                type="date"
                value={form.endDate}
                onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 cursor-pointer"
              />
              {errors.endDate && <p className="text-xs text-red-500 mt-1">{errors.endDate}</p>}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1.5">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={2}
              maxLength={500}
              placeholder="Brief description visible to customers…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 placeholder-gray-400 resize-none"
            />
          </div>

          {/* Product Selection */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-2">Applicable Products *</label>
            {loading ? (
              <div className="text-xs text-gray-400 py-2">Loading products...</div>
            ) : (
              <div className="grid grid-cols-1 gap-1.5 max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-2">
                {products.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => toggleProduct(p.id)}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg text-left cursor-pointer transition-all ${form.productIds.includes(p.id) ? 'bg-emerald-50 border border-emerald-200' : 'hover:bg-gray-50 border border-transparent'}`}
                  >
                    <div className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center ${form.productIds.includes(p.id) ? 'bg-emerald-500 border-emerald-500' : 'border-gray-300'}`}>
                      {form.productIds.includes(p.id) && <i className="ri-check-line text-white text-xs"></i>}
                    </div>
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0 overflow-hidden">
                      {p.image_url ? (
                        <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                      ) : (
                        <i className="ri-box-3-line text-emerald-500 text-xs"></i>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{p.name}</p>
                      <p className="text-xs text-gray-400 font-mono">{p.sku} · {formatAmount(p.price)} · {p.stock} in stock</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {errors.products && <p className="text-xs text-red-500 mt-1">{errors.products}</p>}
          </div>

          {/* Stock Impact Preview */}
          {form.productIds.length > 0 && (
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <i className="ri-bar-chart-2-line text-emerald-500"></i>
                Stock Impact Preview
              </p>
              {form.type === 'bundle' && form.bundlePrice > 0 && (
                <div className="flex items-center justify-between mb-3 text-sm">
                  <span className="text-gray-500">Original total</span>
                  <span className="line-through text-gray-400">{formatAmount(originalTotal)}</span>
                </div>
              )}
              {form.type !== 'buy_x_get_y' && form.type !== 'bundle' && form.discountValue > 0 && (
                <div className="flex items-center justify-between mb-3 text-sm">
                  <span className="text-gray-500">Discounted price (avg)</span>
                  <div className="flex items-center gap-2">
                    <span className="line-through text-gray-400">{formatAmount(originalTotal)}</span>
                    <span className="font-bold text-emerald-700">{formatAmount(discountedTotal)}</span>
                  </div>
                </div>
              )}
              <div className="space-y-2">
                {stockImpactDays.map((p) => {
                  const daysLeft = p.dailyImpact > 0 ? Math.floor(p.stock / p.dailyImpact) : 999;
                  const isRisky = daysLeft < 5;
                  return (
                    <div key={p.name} className="flex items-center justify-between text-sm">
                      <span className="text-gray-600 truncate flex-1 mr-2">{p.name}</span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${isRisky ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'}`}>
                        {isRisky ? `⚠ ~${daysLeft}d stock left` : `~${daysLeft}d stock`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer whitespace-nowrap">
            Cancel
          </button>
          <button onClick={() => { if (validate()) onSubmit({ ...form }); }} className="px-5 py-2 bg-emerald-500 text-white text-sm font-semibold rounded-lg hover:bg-emerald-600 cursor-pointer whitespace-nowrap">
            <i className="ri-flashlight-line mr-1.5"></i>Launch Promotion
          </button>
        </div>
      </div>
    </div>
  );
}