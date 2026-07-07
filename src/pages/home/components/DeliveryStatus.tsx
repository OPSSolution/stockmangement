import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface Delivery {
  id: string;
  order_id: string;
  customer: string;
  city: string;
  status: string;
  total_items: number;
  lastUpdate?: string;
  updated_at: string;
  created_at: string;
}

const steps = [
  { key: 'prepare', label: 'Prepare', icon: 'ri-inbox-2-line' },
  { key: 'ready', label: 'Ready', icon: 'ri-checkbox-circle-line' },
  { key: 'in_transit', label: 'In Transit', icon: 'ri-truck-line' },
  { key: 'delivered', label: 'Delivered', icon: 'ri-home-2-line' },
];

const statusIndex: Record<string, number> = {
  prepare: 0,
  ready: 1,
  in_transit: 2,
  delivered: 3,
};

const statusColors: Record<string, { badge: string; text: string }> = {
  prepare: { badge: 'bg-gray-100 text-gray-500', text: 'Preparing' },
  ready: { badge: 'bg-sky-50 text-sky-600', text: 'Ready for Pickup' },
  in_transit: { badge: 'bg-amber-50 text-amber-600', text: 'In Transit' },
  delivered: { badge: 'bg-emerald-50 text-emerald-600', text: 'Delivered' },
};

export default function DeliveryStatus() {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDeliveries() {
      const { data, error } = await supabase.from('deliveries').select('*').order('created_at', { ascending: false }).limit(5);
      if (!error && data) {
        setDeliveries(data as Delivery[]);
      }
      setLoading(false);
    }
    fetchDeliveries();
  }, []);

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center gap-2 text-gray-400">
          <i className="ri-loader-4-line animate-spin"></i>
          <span className="text-sm">Loading deliveries...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-gray-900 tracking-tight">Active Deliveries</h3>
          <p className="text-xs text-gray-400 mt-0.5">Live delivery tracking</p>
        </div>
        <button className="text-xs text-emerald-600 font-medium hover:text-emerald-700 cursor-pointer whitespace-nowrap">
          View All
        </button>
      </div>
      <div className="divide-y divide-gray-50">
        {deliveries.map((d) => {
          const idx = statusIndex[d.status] ?? 0;
          const sc = statusColors[d.status] || statusColors.prepare;
          return (
            <div key={d.id} className="px-5 py-4 hover:bg-gray-50/40 transition-colors">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-800">{d.order_id}</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${sc.badge}`}>{sc.text}</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">{d.customer} · {d.city}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold text-gray-700">{d.total_items} item{d.total_items > 1 ? 's' : ''}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {d.updated_at ? new Date(d.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                  </p>
                </div>
              </div>
              {/* Progress bar */}
              <div className="flex items-center gap-0">
                {steps.map((step, i) => {
                  const done = i <= idx;
                  const active = i === idx;
                  return (
                    <div key={step.key} className="flex items-center flex-1">
                      <div className={`flex flex-col items-center gap-1 flex-shrink-0`}>
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                          done
                            ? active
                              ? 'bg-emerald-500 ring-2 ring-emerald-100'
                              : 'bg-emerald-500'
                            : 'bg-gray-100'
                        }`}>
                          <i className={`${step.icon} text-xs ${done ? 'text-white' : 'text-gray-300'}`}></i>
                        </div>
                        <span className={`text-xs leading-none whitespace-nowrap ${
                          done ? (active ? 'text-emerald-600 font-semibold' : 'text-emerald-500') : 'text-gray-300'
                        }`}>{step.label}</span>
                      </div>
                      {i < steps.length - 1 && (
                        <div className={`h-0.5 flex-1 mx-1 mb-4 ${i < idx ? 'bg-emerald-400' : 'bg-gray-100'}`} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}