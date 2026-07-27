import { useState } from 'react';
import { useCurrency } from '@/contexts/CurrencyContext';
import type { CategoryBreakdownItem } from '../page';

interface CategoryBreakdownChartProps {
  data: CategoryBreakdownItem[];
  loading: boolean;
}

export default function CategoryBreakdownChart({ data, loading }: CategoryBreakdownChartProps) {
  const { formatAmount } = useCurrency();
  const [hovered, setHovered] = useState<string | null>(null);

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

  // Real, derivable stats only — there's no cost/COGS data in the schema, so a
  // margin figure isn't computable; "Lowest Revenue" replaces it instead of
  // fabricating a number.
  const byRevenueDesc = [...categoryBreakdown].sort((a, b) => b.revenue - a.revenue);
  const topRevenue = byRevenueDesc[0];
  const lowestRevenue = byRevenueDesc[byRevenueDesc.length - 1];
  const mostOnHold = [...categoryBreakdown].sort((a, b) => b.onHoldUnits - a.onHoldUnits)[0];

  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5">
      <div className="mb-4">
        <h3 className="text-sm font-bold text-gray-900 tracking-tight">Revenue by Category</h3>
        <p className="text-xs text-gray-400 mt-0.5">Total {formatAmount(totalRevenue)}</p>
      </div>

      {categoryBreakdown.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-gray-400 text-sm">No sales in this period</div>
      ) : (
        <>
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
              { label: 'Top Revenue', val: topRevenue?.category ?? '—', sub: topRevenue ? formatAmount(topRevenue.revenue) : '', subColor: 'text-emerald-600' },
              { label: 'Lowest Revenue', val: lowestRevenue?.category ?? '—', sub: lowestRevenue ? formatAmount(lowestRevenue.revenue) : '', subColor: 'text-gray-500' },
              { label: 'Most On Hold', val: mostOnHold && mostOnHold.onHoldUnits > 0 ? mostOnHold.category : '—', sub: mostOnHold && mostOnHold.onHoldUnits > 0 ? `${mostOnHold.onHoldRate}% of stock` : 'none', subColor: 'text-amber-600' },
            ].map((s) => (
              <div key={s.label} className="bg-gray-50 rounded-lg py-2.5 px-2">
                <p className="font-semibold text-gray-800">{s.val}</p>
                <p className="text-gray-400 mt-0.5">{s.label}</p>
                <p className={`${s.subColor} text-xs mt-0.5`}>{s.sub}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
