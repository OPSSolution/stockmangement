import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useCurrency } from '@/contexts/CurrencyContext';

interface Product {
  id: string;
  name: string;
  sku: string;
  category: string;
  warehouse: string;
  vendor?: string;
  stock: number;
  lowStockThreshold: number;
  price: number;
  status: 'in_stock' | 'low_stock' | 'out_of_stock';
  lastUpdated: string;
}

interface KpiCard {
  label: string;
  value: string | number;
  sub: string;
  icon: string;
  iconBg: string;
  iconColor: string;
  trend?: string;
  trendDir?: 'up' | 'down' | 'neutral';
}

export default function KpiCards() {
  const [products, setProducts] = useState<Product[]>([]);
  const [deliveries, setDeliveries] = useState<{ status: string }[]>([]);
  const [stockAlerts, setStockAlerts] = useState<{ severity: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const { formatAmount } = useCurrency();

  useEffect(() => {
    async function fetchData() {
      const [{ data: p }, { data: d }, { data: a }] = await Promise.all([
        supabase.from('products').select('*'),
        supabase.from('deliveries').select('status'),
        supabase.from('products').select('stock, low_stock_threshold, severity:status').lt('stock', 50),
      ]);
      if (p) setProducts(p as Product[]);
      if (d) setDeliveries(d as { status: string }[]);
      if (a) {
        const alerts = (a as unknown as Array<{ stock: number; low_stock_threshold: number; severity: string }>)
          .filter((x) => x.stock <= x.low_stock_threshold)
          .map((x) => ({ severity: x.stock === 0 ? 'critical' : 'warning' }));
        setStockAlerts(alerts);
      }
      setLoading(false);
    }
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 animate-pulse h-28" />
        ))}
      </div>
    );
  }

  const totalProducts = products.length;
  const totalStock = products.reduce((a, b) => a + b.stock, 0);
  const lowStockCount = products.filter((p) => p.status === 'low_stock').length;
  const outOfStockCount = products.filter((p) => p.status === 'out_of_stock').length;
  const activeDeliveries = deliveries.filter((d) => d.status === 'in_transit' || d.status === 'ready').length;
  const criticalAlerts = stockAlerts.filter((a) => a.severity === 'critical').length;
  const totalStockValue = products.reduce((sum, p) => sum + p.stock * p.price, 0);

  const cards: KpiCard[] = [
    {
      label: 'Total Products',
      value: totalProducts,
      sub: `${totalStock.toLocaleString()} units across all warehouses`,
      icon: 'ri-archive-stack-line',
      iconBg: 'from-emerald-50 to-emerald-100/60',
      iconColor: 'text-emerald-600',
      trend: '+3 this week',
      trendDir: 'up',
    },
    {
      label: 'Low Stock Items',
      value: lowStockCount,
      sub: `${outOfStockCount} items completely out of stock`,
      icon: 'ri-error-warning-line',
      iconBg: 'from-amber-50 to-amber-100/60',
      iconColor: 'text-amber-500',
      trend: `${criticalAlerts} critical alerts`,
      trendDir: 'down',
    },
    {
      label: 'Active Deliveries',
      value: activeDeliveries,
      sub: 'In transit or ready for pickup',
      icon: 'ri-truck-line',
      iconBg: 'from-sky-50 to-sky-100/60',
      iconColor: 'text-sky-500',
      trend: '1 delivered today',
      trendDir: 'up',
    },
    {
      label: 'Pending Orders',
      value: 7,
      sub: '3 awaiting vendor response',
      icon: 'ri-shopping-bag-3-line',
      iconBg: 'from-violet-50 to-violet-100/60',
      iconColor: 'text-violet-500',
      trend: '+2 since yesterday',
      trendDir: 'neutral',
    },
    {
      label: 'Total Stock Value',
      value: formatAmount(totalStockValue),
      sub: 'BM + Vendor warehouses combined',
      icon: 'ri-money-dollar-circle-line',
      iconBg: 'from-emerald-50 to-emerald-100/60',
      iconColor: 'text-emerald-600',
      trend: formatAmount(totalStockValue * 0.025),
      trendDir: 'up',
    },
    {
      label: 'Pending Transfers',
      value: 4,
      sub: 'Vendor → BM warehouse',
      icon: 'ri-swap-box-line',
      iconBg: 'from-orange-50 to-orange-100/60',
      iconColor: 'text-orange-500',
      trend: '2 shipped to BM',
      trendDir: 'neutral',
    },
  ];

  const trendColors = {
    up: 'text-emerald-500',
    down: 'text-red-400',
    neutral: 'text-gray-400',
  };

  const trendIcons = {
    up: 'ri-arrow-up-s-line',
    down: 'ri-arrow-down-s-line',
    neutral: 'ri-subtract-line',
  };

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
      {cards.map((card, i) => (
        <div
          key={i}
          className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col gap-3 hover:shadow-md hover:-translate-y-0.5 hover:border-emerald-200 transition-all duration-200 cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${card.iconBg} flex items-center justify-center`}>
              <i className={`${card.icon} ${card.iconColor} text-lg`}></i>
            </div>
            {card.trend && (
              <div className={`flex items-center gap-0.5 text-xs font-medium ${trendColors[card.trendDir || 'neutral']}`}>
                <div className="w-3 h-3 flex items-center justify-center">
                  <i className={`${trendIcons[card.trendDir || 'neutral']} text-sm`}></i>
                </div>
              </div>
            )}
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900 tracking-tight">{card.value}</p>
            <p className="text-xs font-semibold text-gray-500 mt-0.5">{card.label}</p>
          </div>
          <p className="text-xs text-gray-400 leading-tight">{card.sub}</p>
          {card.trend && (
            <div className={`flex items-center gap-1 text-xs font-medium ${trendColors[card.trendDir || 'neutral']}`}>
              <div className="w-3 h-3 flex items-center justify-center">
                <i className={`${trendIcons[card.trendDir || 'neutral']} text-sm`}></i>
              </div>
              <span>{card.trend}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}