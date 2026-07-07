import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useCurrency } from '@/contexts/CurrencyContext';

type ProductStatus = 'in_stock' | 'low_stock' | 'out_of_stock';

interface Product {
  id: string;
  name: string;
  sku: string;
  category: string;
  warehouse: string;
  vendor?: string;
  stock: number;
  low_stock_threshold: number;
  price: number;
  status: ProductStatus;
  last_updated: string;
}

const categoryColors: Record<string, string> = {
  Electronics: 'bg-sky-50 text-sky-600',
  Furniture: 'bg-amber-50 text-amber-600',
  Accessories: 'bg-violet-50 text-violet-600',
  Lighting: 'bg-yellow-50 text-yellow-600',
  'Smart Home': 'bg-emerald-50 text-emerald-600',
};

const statusConfig: Record<ProductStatus, { label: string; dot: string; text: string }> = {
  in_stock: { label: 'In Stock', dot: 'bg-emerald-400', text: 'text-emerald-600' },
  low_stock: { label: 'Low Stock', dot: 'bg-amber-400', text: 'text-amber-600' },
  out_of_stock: { label: 'Out of Stock', dot: 'bg-red-400', text: 'text-red-500' },
};

export default function StockTable() {
  const { formatAmount } = useCurrency();
  const [products, setProducts] = useState<Product[]>([]);
  const [filter, setFilter] = useState<'all' | ProductStatus>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchProducts() {
      const { data, error } = await supabase.from('products').select('*');
      if (!error && data) {
        setProducts(
          data.map((p) => ({
            ...p,
            status: (p.status || 'in_stock') as ProductStatus,
            low_stock_threshold: p.low_stock_threshold || 0,
            last_updated: p.last_updated || p.lastUpdated || '',
          }))
        );
      }
      setLoading(false);
    }
    fetchProducts();
  }, []);

  const filtered = products.filter((p) => {
    const matchStatus = filter === 'all' || p.status === filter;
    const matchSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
        <div className="flex items-center gap-2 text-gray-400">
          <i className="ri-loader-4-line animate-spin"></i>
          <span className="text-sm">Loading inventory...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-gray-900 tracking-tight">Inventory Overview</h3>
          <p className="text-xs text-gray-400 mt-0.5">All products across warehouses</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Filter tabs */}
          <div className="flex items-center bg-gray-50 rounded-lg p-1 gap-1">
            {(['all', 'in_stock', 'low_stock', 'out_of_stock'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all cursor-pointer whitespace-nowrap ${
                  filter === f ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                {f === 'all' ? 'All' : f === 'in_stock' ? 'In Stock' : f === 'low_stock' ? 'Low Stock' : 'Out of Stock'}
              </button>
            ))}
          </div>
          {/* Search */}
          <div className="relative">
            <div className="w-4 h-4 flex items-center justify-center absolute left-2.5 top-1/2 -translate-y-1/2">
              <i className="ri-search-line text-gray-400 text-xs"></i>
            </div>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search SKU, name..."
              className="pl-7 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg w-40 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-300 transition-all"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50/70">
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Product</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">SKU</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Category</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Warehouse</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Stock</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Status</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Price</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.map((p) => {
              const sc = statusConfig[p.status];
              const cc = categoryColors[p.category] || 'bg-gray-50 text-gray-600';
              const pct = Math.min((p.stock / (p.low_stock_threshold * 3 || 1)) * 100, 100);
              return (
                <tr key={p.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-5 py-3.5">
                    <div>
                      <p className="text-sm font-semibold text-gray-800 leading-tight">{p.name}</p>
                      {p.vendor && <p className="text-xs text-gray-400 mt-0.5">{p.vendor}</p>}
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="text-xs font-mono text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{p.sku}</span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${cc}`}>{p.category}</span>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-1.5">
                      <div className="w-3.5 h-3.5 flex items-center justify-center">
                        <i className={`ri-building-2-line text-xs ${p.warehouse === 'BM Warehouse' ? 'text-emerald-500' : 'text-violet-400'}`}></i>
                      </div>
                      <span className="text-xs text-gray-600">{p.warehouse}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2 min-w-[80px]">
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            p.status === 'out_of_stock'
                              ? 'bg-red-400'
                              : p.status === 'low_stock'
                              ? 'bg-amber-400'
                              : 'bg-emerald-400'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-sm font-bold text-gray-800 w-8 text-right">{p.stock}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className={`flex items-center gap-1.5 ${sc.text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`}></span>
                      <span className="text-xs font-medium whitespace-nowrap">{sc.label}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="text-sm font-semibold text-gray-700">{formatAmount(p.price)}</span>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-1">
                      <button className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-emerald-50 text-gray-400 hover:text-emerald-600 transition-colors cursor-pointer" title="View Details">
                        <i className="ri-eye-line text-sm"></i>
                      </button>
                      <button className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-sky-50 text-gray-400 hover:text-sky-600 transition-colors cursor-pointer" title="Edit Stock">
                        <i className="ri-edit-line text-sm"></i>
                      </button>
                      <button className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-amber-50 text-gray-400 hover:text-amber-600 transition-colors cursor-pointer" title="Transfer">
                        <i className="ri-swap-box-line text-sm"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="py-12 text-center text-sm text-gray-400">No products found matching your filters.</div>
        )}
      </div>

      <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
        <p className="text-xs text-gray-400">Showing {filtered.length} of {products.length} products</p>
        <button className="text-xs text-emerald-600 font-medium hover:text-emerald-700 cursor-pointer whitespace-nowrap">
          View All Inventory <i className="ri-arrow-right-s-line"></i>
        </button>
      </div>
    </div>
  );
}