import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useCurrency } from '@/contexts/CurrencyContext';

interface Snapshot {
  month: string;
  revenue: number;
  orders: number;
  returns: number;
  transfers: number;
  purchases: number;
  avgOrderValue: number;
}

function mapSnapshot(row: Record<string, unknown>): Snapshot {
  return {
    month: row.month as string,
    revenue: row.revenue as number,
    orders: row.orders as number,
    returns: row.returns as number,
    transfers: row.transfers as number,
    purchases: row.purchases as number,
    avgOrderValue: row.avg_order_value as number,
  };
}

export default function MonthlySnapshotTable() {
  const { formatAmount } = useCurrency();
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('monthly_snapshots').select('*').order('month', { ascending: true }).then(({ data, error }) => {
      if (error) console.error(error);
      else setSnapshots((data || []).map(mapSnapshot));
      setLoading(false);
    });
  }, []);

  if (loading) return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5 flex items-center justify-center py-10 text-gray-400">
      <i className="ri-loader-4-line animate-spin text-xl mr-2"></i>
      <span className="text-sm">Loading snapshots...</span>
    </div>
  );

  const monthlySnapshots = snapshots;
  const latest = monthlySnapshots[monthlySnapshots.length - 1];
  const previous = monthlySnapshots[monthlySnapshots.length - 2];

  const growthPct = (curr: number, prev: number) => {
    if (prev === 0) return null;
    return (((curr - prev) / prev) * 100).toFixed(1);
  };

  const revenueGrowth = latest && previous ? growthPct(latest.revenue, previous.revenue) : null;

  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-bold text-gray-900 tracking-tight">Monthly Snapshot</h3>
          <p className="text-xs text-gray-400 mt-0.5">Year-to-date performance across all modules</p>
        </div>
        {revenueGrowth && (
          <div className={`flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full ${Number(revenueGrowth) >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
            <i className={Number(revenueGrowth) >= 0 ? 'ri-arrow-up-line' : 'ri-arrow-down-line'}></i>
            {Math.abs(Number(revenueGrowth))}% MoM
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Month</th>
              <th className="text-right py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Revenue</th>
              <th className="text-right py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Orders</th>
              <th className="text-right py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Returns</th>
              <th className="text-right py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Transfers</th>
              <th className="text-right py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Purchases</th>
              <th className="text-right py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Avg Order</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {monthlySnapshots.map((m, i) => {
              const isLatest = i === monthlySnapshots.length - 1;
              const prev = monthlySnapshots[i - 1];
              const revGrowth = prev ? growthPct(m.revenue, prev.revenue) : null;
              return (
                <tr key={m.month} className={`hover:bg-gray-50/50 transition-colors ${isLatest ? 'bg-emerald-50/30' : ''}`}>
                  <td className="py-3 font-semibold text-gray-800">
                    {m.month}
                    {isLatest && <span className="ml-2 text-xs text-emerald-600 font-normal">(current)</span>}
                  </td>
                  <td className="py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {revGrowth && (
                        <span className={`text-xs font-medium ${Number(revGrowth) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                          {Number(revGrowth) >= 0 ? '+' : ''}{revGrowth}%
                        </span>
                      )}
                      <span className="font-bold text-gray-900">{formatAmount(m.revenue)}</span>
                    </div>
                  </td>
                  <td className="py-3 text-right font-semibold text-gray-700">{m.orders}</td>
                  <td className="py-3 text-right">
                    <span className={`font-semibold ${m.returns > 30 ? 'text-red-500' : 'text-amber-600'}`}>{m.returns}</span>
                  </td>
                  <td className="py-3 text-right text-gray-600">{m.transfers}</td>
                  <td className="py-3 text-right text-gray-600">{m.purchases}</td>
                  <td className="py-3 text-right text-gray-700 font-medium">{formatAmount(m.avgOrderValue)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t-2 border-gray-200">
            <tr className="bg-gray-50">
              <td className="py-3 font-bold text-gray-800">YTD Total</td>
              <td className="py-3 text-right font-bold text-emerald-700">{formatAmount(monthlySnapshots.reduce((s, m) => s + m.revenue, 0))}</td>
              <td className="py-3 text-right font-bold text-gray-800">{monthlySnapshots.reduce((s, m) => s + m.orders, 0)}</td>
              <td className="py-3 text-right font-bold text-amber-700">{monthlySnapshots.reduce((s, m) => s + m.returns, 0)}</td>
              <td className="py-3 text-right font-bold text-gray-700">{monthlySnapshots.reduce((s, m) => s + m.transfers, 0)}</td>
              <td className="py-3 text-right font-bold text-gray-700">{monthlySnapshots.reduce((s, m) => s + m.purchases, 0)}</td>
              <td className="py-3 text-right font-bold text-gray-700">
                {monthlySnapshots.length > 0 ? formatAmount(monthlySnapshots.reduce((s, m) => s + m.avgOrderValue, 0) / monthlySnapshots.length) : '—'}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}