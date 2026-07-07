import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useCurrency } from '@/contexts/CurrencyContext';

interface CategoryData {
  category: string;
  revenue: number;
  color: string;
}

export default function CategoryBreakdownChart() {
  const { formatAmount } = useCurrency();
  const [hovered, setHovered] = useState<string | null>(null);
  const [data, setData] = useState<CategoryData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('category_breakdown').select('*').then(({ data: rows, error }) => {
      if (error) console.error(error);
      else setData((rows || []).map((r) => ({ category: r.category, revenue: r.revenue, color: r.color })));
      setLoading(false);
    });
  }, []);

  const categoryBreakdown = data;
  const totalRevenue = categoryBreakdown.reduce((s, c) => s + c.revenue, 0);

  let cumulative = 0;
  const segments = categoryBreakdown.map((c) => {
    const pct = totalRevenue > 0 ? (c.revenue / totalRevenue) * 100 : 0;
    const start = cumulative;
    cumulative += pct;
    return { ...c, pct, start, end: cumulative };
  });

  const conicGradient = segments
    .map((s) => `${s.color} ${s.start.toFixed(1)}% ${s.end.toFixed(1)}%`)
    .join(', ');

  if (loading) return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5 flex items-center justify-center py-16 text-gray-400">
      <i className="ri-loader-4-line animate-spin text-xl mr-2"></i>
      <span className="text-sm">Loading...</span>
    </div>
  );

  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5">
      <div className="mb-4">
        <h3 className="text-sm font-bold text-gray-900 tracking-tight">Revenue by Category</h3>
        <p className="text-xs text-gray-400 mt-0.5">Total {formatAmount(totalRevenue)}</p>
      </div>

      <div className="flex items-center gap-6">
        {/* Donut */}
        <div className="relative flex-shrink-0">
          <div
            className="w-36 h-36 rounded-full"
            style={{ background: `conic-gradient(${conicGradient || '#e5e7eb 0% 100%'})` }}
          ></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-20 h-20 bg-white rounded-full flex flex-col items-center justify-center">
              <p className="text-xs font-bold text-gray-800">{categoryBreakdown.length}</p>
              <p className="text-xs text-gray-400">categories</p>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex-1 space-y-2.5">
          {segments.map((c) => (
            <div
              key={c.category}
              onMouseEnter={() => setHovered(c.category)}
              onMouseLeave={() => setHovered(null)}
              className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-all ${hovered === c.category ? 'bg-gray-50' : ''}`}
            >
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: c.color }}></div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center">
                  <p className="text-xs font-semibold text-gray-700">{c.category}</p>
                  <p className="text-xs font-bold text-gray-900">{c.pct.toFixed(1)}%</p>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-1 mt-1">
                  <div className="h-1 rounded-full transition-all" style={{ width: `${c.pct}%`, backgroundColor: c.color }}></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-3 gap-2 text-center text-xs">
        {[
          { label: 'Best Margin', val: 'Smart Home', sub: '0.7% returns' },
          { label: 'Top Revenue', val: categoryBreakdown[0]?.category ?? '—', sub: categoryBreakdown[0] ? formatAmount(categoryBreakdown[0].revenue) : '' },
          { label: 'Highest Returns', val: 'Accessories', sub: '5.2% rate' },
        ].map((s) => (
          <div key={s.label} className="bg-gray-50 rounded-lg py-2.5 px-2">
            <p className="font-semibold text-gray-800">{s.val}</p>
            <p className="text-gray-400 mt-0.5">{s.label}</p>
            <p className="text-emerald-600 text-xs mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>
    </div>
  );
}