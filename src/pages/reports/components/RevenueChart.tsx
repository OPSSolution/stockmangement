import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useCurrency } from '@/contexts/CurrencyContext';

type View = 'daily' | 'monthly';

interface DataPoint { date: string; revenue: number; orders: number; returns: number; }

export default function RevenueChart() {
  const { formatAmount } = useCurrency();
  const [view, setView] = useState<View>('daily');
  const [dailyData, setDailyData] = useState<DataPoint[]>([]);
  const [monthlyData, setMonthlyData] = useState<DataPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const [dailyRes, monthlyRes] = await Promise.all([
      supabase.from('daily_revenue').select('date, revenue, orders, returns').order('date', { ascending: true }),
      supabase.from('monthly_snapshots').select('month, revenue, orders, returns').order('month', { ascending: true }),
    ]);
    if (dailyRes.data) setDailyData(dailyRes.data.map((d) => ({ date: d.date, revenue: d.revenue, orders: d.orders, returns: d.returns })));
    if (monthlyRes.data) setMonthlyData(monthlyRes.data.map((m) => ({ date: m.month, revenue: m.revenue, orders: m.orders, returns: m.returns })));
    setLoading(false);
  };

  const data = view === 'daily' ? dailyData : monthlyData;
  const maxRevenue = data.length > 0 ? Math.max(...data.map((d) => d.revenue)) : 1;
  const totalRevenue = data.reduce((s, d) => s + d.revenue, 0);
  const totalOrders = data.reduce((s, d) => s + d.orders, 0);
  const totalReturns = data.reduce((s, d) => s + d.returns, 0);

  const toBarH = (v: number, max: number) => Math.max(4, Math.round((v / max) * 140));

  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h3 className="text-sm font-bold text-gray-900 tracking-tight">Revenue Trend</h3>
          <p className="text-xs text-gray-400 mt-0.5">Total revenue across selected period</p>
        </div>
        <div className="flex items-center gap-2 bg-gray-50 rounded-lg p-1">
          {(['daily', 'monthly'] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer capitalize whitespace-nowrap ${view === v ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {v === 'daily' ? 'This Month (Daily)' : 'Monthly (YTD)'}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Row */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label: 'Total Revenue', val: formatAmount(totalRevenue), color: 'text-emerald-700', bg: 'bg-emerald-50' },
          { label: 'Total Orders', val: totalOrders, color: 'text-sky-700', bg: 'bg-sky-50' },
          { label: 'Return Events', val: totalReturns, color: 'text-amber-700', bg: 'bg-amber-50' },
        ].map((s) => (
          <div key={s.label} className={`${s.bg} rounded-xl px-4 py-3`}>
            <p className={`text-xl font-bold ${s.color}`}>{s.val}</p>
            <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Bar Chart */}
      {loading ? (
        <div className="flex items-center justify-center h-40 text-gray-400">
          <i className="ri-loader-4-line animate-spin text-xl mr-2"></i>
          <span className="text-sm">Loading...</span>
        </div>
      ) : (
        <div className="flex items-end gap-1.5 h-40 overflow-x-auto pb-1">
          {data.map((d, i) => {
            const h = toBarH(d.revenue, maxRevenue);
            const isLast = i === data.length - 1;
            return (
              <div key={d.date} className="flex flex-col items-center gap-1 flex-shrink-0" style={{ minWidth: view === 'daily' ? '32px' : '48px' }}>
                <div className="relative group">
                  <div
                    className={`w-full rounded-t transition-all cursor-pointer hover:opacity-80 ${isLast && view === 'daily' ? 'bg-emerald-500' : 'bg-emerald-400'}`}
                    style={{ height: `${h}px`, minWidth: view === 'daily' ? '28px' : '44px' }}
                  ></div>
                  {/* Tooltip */}
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-10 pointer-events-none">
                    <div className="bg-gray-900 text-white text-xs rounded-lg px-2.5 py-2 whitespace-nowrap shadow-lg">
                      <p className="font-semibold">{d.date}</p>
                      <p>{formatAmount(d.revenue)}</p>
                      <p>{d.orders} orders</p>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-gray-400 whitespace-nowrap" style={{ fontSize: '10px' }}>{d.date.replace('May ', '')}</p>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-2 mt-3 text-xs text-gray-400">
        <span className="w-2.5 h-2.5 bg-emerald-400 rounded-sm inline-block"></span>
        Revenue per {view === 'daily' ? 'day' : 'month'} · Hover bars for details
      </div>
    </div>
  );
}