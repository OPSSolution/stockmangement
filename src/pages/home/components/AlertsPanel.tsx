import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useNotifications } from '@/contexts/NotificationContext';

interface StockAlert {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  warehouse: string;
  currentStock: number;
  threshold: number;
  severity: 'critical' | 'warning';
  timestamp: string;
}

export default function AlertsPanel() {
  const [stockAlerts, setStockAlerts] = useState<StockAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const { notifications, markAsRead, deleteNotification } = useNotifications();
  const navigate = useNavigate();

  const stockNotifications = notifications.filter(
    (n) => (n.type === 'low_stock' || n.type === 'out_of_stock') && !n.is_read
  );

  useEffect(() => {
    async function fetchAlerts() {
      const { data, error } = await supabase.from('products').select('*');
      if (!error && data) {
        const alerts: StockAlert[] = data
          .filter((p: Record<string, unknown>) => (p.stock as number) <= (p.low_stock_threshold as number))
          .map((p: Record<string, unknown>) => ({
            id: `A-${p.id}`,
            productId: p.id as string,
            productName: p.name as string,
            sku: p.sku as string,
            warehouse: p.warehouse as string,
            currentStock: p.stock as number,
            threshold: p.low_stock_threshold as number,
            severity: (p.stock as number) === 0 ? 'critical' : 'warning',
            timestamp: p.last_updated as string,
          }));
        setStockAlerts(alerts);
      }
      setLoading(false);
    }
    fetchAlerts();
  }, [notifications]);

  const handleDismiss = async (alertId: string, isNotification: boolean) => {
    if (isNotification) {
      await markAsRead(alertId);
    }
  };

  const handleRestock = (productId: string) => {
    navigate(`/inventory?restock=${productId}`);
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col p-6">
        <div className="flex items-center gap-2 text-gray-400">
          <i className="ri-loader-4-line animate-spin"></i>
          <span className="text-sm">Loading alerts...</span>
        </div>
      </div>
    );
  }

  const totalCritical = stockAlerts.filter((a) => a.severity === 'critical').length;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-gray-900 tracking-tight">Low Stock Alerts</h3>
          <p className="text-xs text-gray-400 mt-0.5">{stockAlerts.length + stockNotifications.length} active alerts</p>
        </div>
        <span className="flex items-center gap-1 text-xs font-semibold text-red-500 bg-red-50 px-2.5 py-1 rounded-full">
          <i className="ri-alarm-warning-line text-sm"></i>
          {totalCritical} Critical
        </span>
      </div>

      <div className="flex-1 divide-y divide-gray-50 overflow-y-auto max-h-[360px]">
        {stockNotifications.length > 0 && (
          <div className="px-5 py-2 bg-emerald-50/40">
            <span className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wider">New Notifications</span>
          </div>
        )}
        {stockNotifications.map((n) => (
          <div key={n.id} className={`px-5 py-3.5 hover:bg-gray-50/60 transition-colors border-l-2 ${n.type === 'out_of_stock' ? 'border-red-400' : 'border-amber-300'}`}>
            <div className="flex items-start gap-3">
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${n.type === 'out_of_stock' ? 'bg-red-50' : 'bg-amber-50'}`}>
                <i className={`ri-alert-line text-sm ${n.type === 'out_of_stock' ? 'text-red-500' : 'text-amber-500'}`}></i>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-800 truncate">{n.title}</p>
                <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{n.message}</p>
              </div>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${n.type === 'out_of_stock' ? 'bg-red-50 text-red-500' : 'bg-amber-50 text-amber-500'}`}>
                {n.type === 'out_of_stock' ? 'Critical' : 'Warning'}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-2 pl-10">
              <button onClick={() => handleRestock((n.data?.product_id as string) || '')} className="text-xs text-emerald-600 font-medium hover:text-emerald-700 cursor-pointer whitespace-nowrap">
                Restock
              </button>
              <span className="text-gray-200">·</span>
              <button onClick={() => handleDismiss(n.id, true)} className="text-xs text-gray-400 font-medium hover:text-gray-600 cursor-pointer whitespace-nowrap">
                Dismiss
              </button>
            </div>
          </div>
        ))}

        {stockAlerts.length > 0 && (
          <div className="px-5 py-2 bg-gray-50/50">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Inventory Status</span>
          </div>
        )}
        {stockAlerts.map((alert) => (
          <div key={alert.id} className={`px-5 py-3.5 hover:bg-gray-50/60 transition-colors ${alert.severity === 'critical' ? 'border-l-2 border-red-400' : 'border-l-2 border-amber-300'}`}>
            <div className="flex items-start gap-3">
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${alert.severity === 'critical' ? 'bg-red-50' : 'bg-amber-50'}`}>
                <i className={`ri-alert-line text-sm ${alert.severity === 'critical' ? 'text-red-500' : 'text-amber-500'}`}></i>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-800 truncate">{alert.productName}</p>
                <p className="text-xs text-gray-400 mt-0.5">{alert.sku} · {alert.warehouse}</p>
                <div className="flex items-center gap-2 mt-2">
                  <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${alert.severity === 'critical' ? 'bg-red-400' : 'bg-amber-400'}`} style={{ width: `${Math.min((alert.currentStock / alert.threshold) * 100, 100)}%` }} />
                  </div>
                  <span className={`text-xs font-bold ${alert.severity === 'critical' ? 'text-red-500' : 'text-amber-500'}`}>
                    {alert.currentStock}/{alert.threshold}
                  </span>
                </div>
              </div>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${alert.severity === 'critical' ? 'bg-red-50 text-red-500' : 'bg-amber-50 text-amber-500'}`}>
                {alert.severity === 'critical' ? 'Critical' : 'Warning'}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-2 pl-10">
              <button onClick={() => handleRestock(alert.productId)} className="text-xs text-emerald-600 font-medium hover:text-emerald-700 cursor-pointer whitespace-nowrap">
                Restock
              </button>
              <span className="text-gray-200">·</span>
              <button onClick={() => handleDismiss(alert.id, false)} className="text-xs text-gray-400 font-medium hover:text-gray-600 cursor-pointer whitespace-nowrap">
                Dismiss
              </button>
            </div>
          </div>
        ))}

        {stockAlerts.length === 0 && stockNotifications.length === 0 && (
          <div className="px-5 py-8 text-center">
            <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-2">
              <i className="ri-check-line text-emerald-400 text-xl"></i>
            </div>
            <p className="text-xs text-gray-400">All stock levels healthy</p>
          </div>
        )}
      </div>

      <div className="px-5 py-3 border-t border-gray-100">
        <button onClick={() => navigate('/inventory')} className="text-xs text-emerald-600 font-medium hover:text-emerald-700 cursor-pointer whitespace-nowrap">
          View All Inventory <i className="ri-arrow-right-s-line"></i>
        </button>
      </div>
    </div>
  );
}