import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useCurrency } from '@/contexts/CurrencyContext';

interface ReasonData { reason: string; count: number; value: number; percentage: number; }

const reasonColors = ['bg-red-400', 'bg-orange-400', 'bg-amber-400', 'bg-violet-400', 'bg-sky-400', 'bg-gray-400'];

export default function ReturnReasonsChart() {
  const { formatAmount } = useCurrency();
  const [data, setData] = useState<ReasonData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('return_reasons').select('*').order('count', { ascending: false }).then(({ data: rows, error }) => {
      if (error) console.error(error);
      else setData((rows || []).map((r) => ({ reason: r.reason, count: r.count, value: r.value, percentage: r.percentage })));
      setLoading(false);
    });
  }, []);

  const returnReasonBreakdown = data;
  const total = returnReasonBreakdown.reduce((s, r) => s + r.count, 0);
  const totalValue = returnReasonBreakdown.reduce((s, r) => s + r.value, 0);

  if (loading) return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5 flex items-center justify-center py-16 text-gray-400">
      <i className="ri-loader-4-line animate-spin text-xl mr-2"></i>
      <span className="text-sm">Loading...</span>
    </div>
  );

  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5">
      <div className="mb-4">
        <h3 className="text-sm font-bold text-gray-900 tracking-tight">Return Reasons Breakdown</h3>
        <p className="text-xs text-gray-400 mt-0.5">{total} total returns · {formatAmount(totalValue)} refunded</p>
      </div>

      {/* Stacked bar */}
      <div className="flex h-4 rounded-full overflow-hidden mb-5 gap-px">
        {returnReasonBreakdown.map((r, i) => (
          <div
            key={r.reason}
            title={`${r.reason}: ${r.percentage}%`}
            className={`${reasonColors[i]} cursor-pointer hover:opacity-80 transition-opacity`}
            style={{ width: `${r.percentage}%` }}
          ></div>
        ))}
      </div>

      <div className="space-y-2.5">
        {returnReasonBreakdown.map((r, i) => (
          <div key={r.reason} className="flex items-center gap-3">
            <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${reasonColors[i]}`}></div>
            <div className="flex-1">
              <div className="flex justify-between items-center mb-1">
                <p className="text-sm text-gray-700 font-medium">{r.reason}</p>
                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <span className="font-semibold text-gray-700">{r.count} returns</span>
                  <span className="font-bold text-gray-900">{formatAmount(r.value)}</span>
                  <span className="font-bold text-gray-600 w-10 text-right">{r.percentage.toFixed(1)}%</span>
                </div>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-1.5">
                <div className={`${reasonColors[i]} h-1.5 rounded-full`} style={{ width: `${r.percentage}%` }}></div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
        <i className="ri-lightbulb-line mr-1.5"></i>
        <strong>Insight:</strong> Defective products are a leading cause of returns. Consider quality checks with vendors.
      </div>
    </div>
  );
}