import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useCurrency } from '@/contexts/CurrencyContext';

interface WarehousePerf { warehouse: string; inbound: number; outbound: number; returns: number; fulfillmentRate: number; avgProcessingDays: number; }
interface VendorPerf { vendor: string; totalOrders: number; fulfillmentRate: number; avgDeliveryDays: number; revenue: number; }

function RatingBar({ value, max = 100, color = 'bg-emerald-500' }: { value: number; max?: number; color?: string }) {
  return (
    <div className="w-full bg-gray-100 rounded-full h-1.5">
      <div className={`${color} h-1.5 rounded-full transition-all`} style={{ width: `${Math.min((value / max) * 100, 100)}%` }}></div>
    </div>
  );
}

export default function WarehousePerformancePanel() {
  const { formatAmount } = useCurrency();
  const [warehouseData, setWarehouseData] = useState<WarehousePerf[]>([]);
  const [vendorData, setVendorData] = useState<VendorPerf[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const [whRes, vRes] = await Promise.all([
      supabase.from('warehouse_performance').select('*'),
      supabase.from('vendor_performance').select('*').order('fulfillment_rate', { ascending: false }),
    ]);
    if (whRes.data) setWarehouseData(whRes.data.map((w) => ({
      warehouse: w.warehouse,
      inbound: w.inbound,
      outbound: w.outbound,
      returns: w.returns,
      fulfillmentRate: w.fulfillment_rate,
      avgProcessingDays: w.avg_processing_days,
    })));
    if (vRes.data) setVendorData(vRes.data.map((v) => ({
      vendor: v.vendor,
      totalOrders: v.total_orders,
      fulfillmentRate: v.fulfillment_rate,
      avgDeliveryDays: v.avg_delivery_days,
      revenue: v.revenue,
    })));
    setLoading(false);
  };

  if (loading) return (
    <div className="space-y-5">
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5 flex items-center justify-center py-16 text-gray-400">
        <i className="ri-loader-4-line animate-spin text-xl mr-2"></i>
        <span className="text-sm">Loading...</span>
      </div>
    </div>
  );

  const maxRevenue = vendorData.length > 0 ? Math.max(...vendorData.map((v) => v.revenue)) : 1;

  return (
    <div className="space-y-5">
      {/* Warehouse Performance */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5">
        <div className="mb-4">
          <h3 className="text-sm font-bold text-gray-900 tracking-tight">Warehouse Performance</h3>
          <p className="text-xs text-gray-400 mt-0.5">Inbound, outbound, returns and fulfillment metrics</p>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {warehouseData.map((w) => (
            <div key={w.warehouse} className="bg-gray-50 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${w.warehouse === 'BM Warehouse' ? 'bg-emerald-100' : 'bg-violet-100'}`}>
                    <i className={`ri-building-2-line text-base ${w.warehouse === 'BM Warehouse' ? 'text-emerald-600' : 'text-violet-600'}`}></i>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-800">{w.warehouse}</p>
                    <p className="text-xs text-gray-400">Avg {w.avgProcessingDays}d processing</p>
                  </div>
                </div>
                <span className={`text-sm font-bold px-3 py-1 rounded-full ${w.fulfillmentRate >= 92 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                  {w.fulfillmentRate}%
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center mb-3">
                {[
                  { label: 'Inbound', val: w.inbound, color: 'text-emerald-600' },
                  { label: 'Outbound', val: w.outbound, color: 'text-sky-600' },
                  { label: 'Returns', val: w.returns, color: 'text-amber-600' },
                ].map((s) => (
                  <div key={s.label} className="bg-white rounded-lg py-2">
                    <p className={`text-base font-bold ${s.color}`}>{s.val.toLocaleString()}</p>
                    <p className="text-xs text-gray-400">{s.label}</p>
                  </div>
                ))}
              </div>

              <div>
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Fulfillment Rate</span>
                  <span className="font-semibold">{w.fulfillmentRate}%</span>
                </div>
                <RatingBar value={w.fulfillmentRate} color={w.fulfillmentRate >= 92 ? 'bg-emerald-500' : 'bg-amber-400'} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Vendor Performance Table */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5">
        <div className="mb-4">
          <h3 className="text-sm font-bold text-gray-900 tracking-tight">Vendor Performance Rankings</h3>
          <p className="text-xs text-gray-400 mt-0.5">Ranked by fulfillment rate</p>
        </div>
        <div className="space-y-2.5">
          {vendorData.map((v, idx) => {
            const revPct = (v.revenue / maxRevenue) * 100;
            const medalColors = ['text-amber-500', 'text-gray-400', 'text-orange-600'];
            return (
              <div key={v.vendor} className="flex items-center gap-3 p-3 bg-gray-50/60 rounded-xl hover:bg-gray-50 transition-colors">
                <span className={`text-sm font-bold w-5 text-center flex-shrink-0 ${idx < 3 ? medalColors[idx] : 'text-gray-400'}`}>
                  {idx < 3 ? ['🥇', '🥈', '🥉'][idx] : `#${idx + 1}`}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-1">
                    <p className="text-sm font-semibold text-gray-800">{v.vendor}</p>
                    <span className={`text-xs font-bold ${v.fulfillmentRate >= 95 ? 'text-emerald-600' : v.fulfillmentRate >= 80 ? 'text-amber-600' : 'text-red-500'}`}>
                      {v.fulfillmentRate}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full ${v.fulfillmentRate >= 95 ? 'bg-emerald-500' : v.fulfillmentRate >= 80 ? 'bg-amber-400' : 'bg-red-400'}`}
                      style={{ width: `${v.fulfillmentRate}%` }}
                    ></div>
                  </div>
                </div>
                <div className="flex gap-4 text-xs text-right flex-shrink-0">
                  <div>
                    <p className="font-semibold text-gray-700">{v.totalOrders}</p>
                    <p className="text-gray-400">orders</p>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-700">{v.avgDeliveryDays}d</p>
                    <p className="text-gray-400">avg</p>
                  </div>
                  <div className="w-20">
                    <p className="font-bold text-gray-800">{formatAmount(v.revenue)}</p>
                    <div className="w-full bg-gray-200 rounded-full h-1 mt-1">
                      <div className="bg-emerald-400 h-1 rounded-full" style={{ width: `${revPct}%` }}></div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}