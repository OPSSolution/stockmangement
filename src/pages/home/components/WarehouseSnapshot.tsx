import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useAuth } from '@/contexts/AuthContext';

interface Product {
  id: string;
  stock: number;
  price: number;
  warehouse: string;
  status: string;
}

const iconFor = (i: number) => [
  { icon: 'ri-building-2-line', iconColor: 'text-emerald-600', iconBg: 'bg-emerald-50', tag: 'Owned', tagColor: 'bg-emerald-50 text-emerald-600' },
  { icon: 'ri-store-2-line', iconColor: 'text-violet-500', iconBg: 'bg-violet-50', tag: 'Vendor', tagColor: 'bg-violet-50 text-violet-500' },
][i % 2];

export default function WarehouseSnapshot() {
  const { formatAmount } = useCurrency();
  const { warehouseScope } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchProducts() {
      let query = supabase.from('products').select('*');
      if (warehouseScope) query = query.in('warehouse', warehouseScope);
      const { data, error } = await query;
      if (!error && data) {
        setProducts(data as Product[]);
      }
      setLoading(false);
    }
    fetchProducts();
  }, [warehouseScope]);

  if (loading) {
    return (
      <div className="h-[400px] bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex items-center">
        <div className="flex items-center gap-2 text-gray-400">
          <i className="ri-loader-4-line animate-spin"></i>
          <span className="text-sm">Loading snapshot...</span>
        </div>
      </div>
    );
  }

  const warehouseNames = Array.from(new Set(products.map((p) => p.warehouse))).sort();

  const warehouseStats = warehouseNames.map((name, i) => {
    const wProducts = products.filter((p) => p.warehouse === name);
    const style = iconFor(i);
    return {
      name,
      ...style,
      total: wProducts.reduce((a, b) => a + b.stock, 0),
      products: wProducts.length,
      lowStock: wProducts.filter((p) => p.status === 'low_stock').length,
      outOfStock: wProducts.filter((p) => p.status === 'out_of_stock').length,
      value: wProducts.reduce((a, b) => a + b.stock * b.price, 0),
    };
  });

  return (
    <div className="h-[400px] bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col">
      <div className="px-5 py-4 border-b border-gray-100 shrink-0">
        <h3 className="text-sm font-bold text-gray-900 tracking-tight">Warehouse Snapshot</h3>
        <p className="text-xs text-gray-400 mt-0.5">
          {warehouseScope ? warehouseScope.join(', ') : 'All warehouses comparison'}
        </p>
      </div>
      <div className={`flex-1 min-h-0 overflow-y-auto content-start p-4 grid gap-3 [&>*:last-child:nth-child(odd)]:col-span-2 ${warehouseStats.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {warehouseStats.map((w) => (
          <div key={w.name} className="rounded-xl border border-gray-100 p-4 hover:border-emerald-200 hover:shadow-sm transition-all duration-200">
            <div className="flex items-center justify-between mb-3">
              <div className={`w-8 h-8 rounded-lg ${w.iconBg} flex items-center justify-center`}>
                <i className={`${w.icon} ${w.iconColor} text-sm`}></i>
              </div>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${w.tagColor}`}>{w.tag}</span>
            </div>
            <p className="text-xs font-semibold text-gray-500 mb-1">{w.name}</p>
            <p className="text-2xl font-bold text-gray-900 tracking-tight">{w.total.toLocaleString()}</p>
            <p className="text-xs text-gray-400 mb-3">total units</p>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-400">Products</span>
                <span className="font-semibold text-gray-700">{w.products}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-amber-500">Low Stock</span>
                <span className="font-semibold text-amber-500">{w.lowStock}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-red-400">Out of Stock</span>
                <span className="font-semibold text-red-400">{w.outOfStock}</span>
              </div>
              <div className="flex items-center justify-between text-xs pt-1 border-t border-gray-50">
                <span className="text-gray-400">Est. Value</span>
                <span className="font-bold text-gray-800">{formatAmount(w.value)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}