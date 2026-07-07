import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useCurrency } from '@/contexts/CurrencyContext';

type SortKey = 'revenue' | 'unitsSold' | 'returnRate';

interface TopProduct {
  productId: string;
  productName: string;
  revenue: number;
  unitsSold: number;
  returnRate: number;
  trend: string;
}

function mapProduct(row: Record<string, unknown>): TopProduct {
  return {
    productId: row.product_id as string,
    productName: row.product_name as string,
    revenue: row.revenue as number,
    unitsSold: row.units_sold as number,
    returnRate: row.return_rate as number,
    trend: (row.trend as string) || 'stable',
  };
}

export default function TopProductsTable() {
  const { formatAmount } = useCurrency();
  const [sortBy, setSortBy] = useState<SortKey>('revenue');
  const [products, setProducts] = useState<TopProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('top_products').select('*').then(({ data, error }) => {
      if (error) console.error(error);
      else setProducts((data || []).map(mapProduct));
      setLoading(false);
    });
  }, []);

  const sorted = [...products].sort((a, b) => {
    if (sortBy === 'returnRate') return a.returnRate - b.returnRate;
    if (sortBy === 'revenue') return b.revenue - a.revenue;
    return b.unitsSold - a.unitsSold;
  });

  const maxRevenue = products.length > 0 ? Math.max(...products.map((p) => p.revenue)) : 1;

  const trendIcon = (trend: string) => ({
    up: <span className="flex items-center gap-0.5 text-emerald-600 text-xs font-medium"><i className="ri-arrow-up-line"></i>Rising</span>,
    down: <span className="flex items-center gap-0.5 text-red-500 text-xs font-medium"><i className="ri-arrow-down-line"></i>Falling</span>,
    stable: <span className="flex items-center gap-0.5 text-gray-400 text-xs font-medium"><i className="ri-arrow-right-line"></i>Stable</span>,
  }[trend]);

  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-bold text-gray-900 tracking-tight">Top Products</h3>
          <p className="text-xs text-gray-400 mt-0.5">Best performers by revenue, units and return rate</p>
        </div>
        <div className="flex items-center gap-1.5 bg-gray-50 rounded-lg p-1">
          {([['revenue', 'Revenue'], ['unitsSold', 'Units Sold'], ['returnRate', 'Return Rate']] as [SortKey, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSortBy(key)}
              className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${sortBy === key ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8 text-gray-400">
          <i className="ri-loader-4-line animate-spin text-xl mr-2"></i>
          <span className="text-sm">Loading...</span>
        </div>
      ) : (
        <div className="space-y-2.5">
          {sorted.map((p, idx) => {
            const revPct = Math.round((p.revenue / maxRevenue) * 100);
            const returnColor = p.returnRate > 5 ? 'text-red-500' : p.returnRate > 2.5 ? 'text-amber-600' : 'text-emerald-600';
            const returnBg = p.returnRate > 5 ? 'bg-red-400' : p.returnRate > 2.5 ? 'bg-amber-400' : 'bg-emerald-500';

            return (
              <div key={p.productId} className="flex items-center gap-4 p-3 bg-gray-50/60 rounded-xl hover:bg-gray-50 transition-colors">
                <span className="text-sm font-bold text-gray-400 w-5 flex-shrink-0 text-center">#{idx + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-semibold text-gray-800 truncate">{p.productName}</p>
                    {trendIcon(p.trend)}
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-1.5">
                    <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${revPct}%` }}></div>
                  </div>
                </div>
                <div className="flex items-center gap-5 flex-shrink-0 text-sm">
                  <div className="text-right w-24">
                    <p className="font-bold text-gray-900">{formatAmount(p.revenue)}</p>
                    <p className="text-xs text-gray-400">revenue</p>
                  </div>
                  <div className="text-right w-14">
                    <p className="font-bold text-gray-700">{p.unitsSold}</p>
                    <p className="text-xs text-gray-400">units</p>
                  </div>
                  <div className="text-right w-16">
                    <div className="flex items-center justify-end gap-1">
                      <div className={`w-1.5 h-1.5 rounded-full ${returnBg}`}></div>
                      <p className={`font-bold ${returnColor}`}>{p.returnRate}%</p>
                    </div>
                    <p className="text-xs text-gray-400">return rate</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}