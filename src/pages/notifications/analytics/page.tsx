import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import DashboardLayout from '@/components/feature/DashboardLayout';
import { useNavigate } from 'react-router-dom';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  LineChart,
  Line,
} from 'recharts';

interface SummaryData {
  total: number;
  unread: number;
  read_rate: number;
  email_rate: number;
  sms_rate: number;
  webhook_rate: number;
  by_type: Record<
    string,
    { total: number; read: number; emailed: number; sms: number; webhook: number }
  >;
}

interface DailyData {
  day: string;
  total: number;
  read: number;
  emailed: number;
  sms: number;
  webhook: number;
}

interface TypeData {
  type: string;
  total: number;
  read_rate: number;
  email_rate: number;
  sms_rate: number;
}

const TYPE_COLORS: Record<string, string> = {
  low_stock: '#f59e0b',
  out_of_stock: '#ef4444',
  new_order: '#10b981',
  return_pending: '#3b82f6',
  transfer_ready: '#8b5cf6',
  delivery_delayed: '#f97316',
  system: '#6b7280',
};

const TYPE_LABELS: Record<string, string> = {
  low_stock: 'Low Stock',
  out_of_stock: 'Out of Stock',
  new_order: 'New Order',
  return_pending: 'Return Pending',
  transfer_ready: 'Transfer Ready',
  delivery_delayed: 'Delivery Delayed',
  system: 'System',
};

export default function NotificationAnalyticsPage() {
  const navigate = useNavigate();
  const [daysBack, setDaysBack] = useState(30);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [dailyData, setDailyData] = useState<DailyData[]>([]);
  const [typeData, setTypeData] = useState<TypeData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);

    // Summary via RPC
    const { data: summaryData } = await supabase.rpc('get_notification_summary', {
      days_back: daysBack,
    });

    if (summaryData && Array.isArray(summaryData) && summaryData.length > 0) {
      setSummary(summaryData[0] as unknown as SummaryData);
    }

    // Daily breakdown
    const { data: daily } = await supabase
      .from('notification_analytics')
      .select('*')
      .gte('day', new Date(Date.now() - daysBack * 86400000).toISOString().split('T')[0])
      .order('day', { ascending: true });

    if (daily) {
      // Aggregate per day across all types
      const dayMap = new Map<string, DailyData>();
      for (const row of daily) {
        const key = row.day;
        if (!dayMap.has(key)) {
          dayMap.set(key, { day: key, total: 0, read: 0, emailed: 0, sms: 0, webhook: 0 });
        }
        const d = dayMap.get(key)!;
        d.total += row.total;
        d.read += row.read_count;
        d.emailed += row.emailed_count;
        d.sms += row.sms_count;
        d.webhook += row.webhook_count;
      }
      setDailyData(Array.from(dayMap.values()));
    }

    // Type breakdown
    const { data: typeRows } = await supabase
      .from('notification_analytics')
      .select('type, total, read_count, emailed_count, sms_count, webhook_count')
      .gte('day', new Date(Date.now() - daysBack * 86400000).toISOString().split('T')[0]);

    if (typeRows) {
      const typeMap = new Map<string, { total: number; read: number; emailed: number; sms: number; webhook: number }>();
      for (const row of typeRows) {
        if (!typeMap.has(row.type)) {
          typeMap.set(row.type, { total: 0, read: 0, emailed: 0, sms: 0, webhook: 0 });
        }
        const t = typeMap.get(row.type)!;
        t.total += row.total;
        t.read += row.read_count;
        t.emailed += row.emailed_count;
        t.sms += row.sms_count;
        t.webhook += row.webhook_count;
      }
      setTypeData(
        Array.from(typeMap.entries()).map(([type, vals]) => ({
          type,
          total: vals.total,
          read_rate: vals.total ? Math.round((vals.read / vals.total) * 100) : 0,
          email_rate: vals.total ? Math.round((vals.emailed / vals.total) * 100) : 0,
          sms_rate: vals.total ? Math.round((vals.sms / vals.total) * 100) : 0,
        }))
      );
    }

    setLoading(false);
  }, [daysBack]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const pieData = typeData.map((t) => ({
    name: TYPE_LABELS[t.type] || t.type,
    value: t.total,
    color: TYPE_COLORS[t.type] || '#6b7280',
  }));

  return (
    <DashboardLayout title="Notification Analytics">
      <div className="max-w-6xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Notification Analytics</h1>
            <p className="text-sm text-gray-400 mt-1">Delivery rates, read rates, and channel performance</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={daysBack}
              onChange={(e) => setDaysBack(parseInt(e.target.value))}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-700 focus:outline-none focus:border-emerald-400 cursor-pointer"
            >
              <option value={7}>Last 7 days</option>
              <option value={14}>Last 14 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
            <button
              onClick={() => navigate('/notifications/history')}
              className="px-4 py-2 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap cursor-pointer"
            >
              <i className="ri-history-line mr-1"></i>
              History
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'Total', value: summary?.total ?? 0, color: 'text-gray-800', bg: 'bg-gray-50', icon: 'ri-notification-3-line' },
            { label: 'Unread', value: summary?.unread ?? 0, color: 'text-amber-600', bg: 'bg-amber-50', icon: 'ri-mail-unread-line' },
            { label: 'Read Rate', value: `${summary?.read_rate ?? 0}%`, color: 'text-emerald-600', bg: 'bg-emerald-50', icon: 'ri-eye-line' },
            { label: 'Email Rate', value: `${summary?.email_rate ?? 0}%`, color: 'text-sky-600', bg: 'bg-sky-50', icon: 'ri-mail-send-line' },
            { label: 'SMS Rate', value: `${summary?.sms_rate ?? 0}%`, color: 'text-violet-600', bg: 'bg-violet-50', icon: 'ri-message-3-line' },
            { label: 'Webhook Rate', value: `${summary?.webhook_rate ?? 0}%`, color: 'text-rose-600', bg: 'bg-rose-50', icon: 'ri-webhook-line' },
          ].map((card) => (
            <div key={card.label} className={`${card.bg} rounded-xl px-4 py-4`}>
              <div className="flex items-center gap-2 mb-2">
                <i className={`${card.icon} text-gray-400 text-sm`}></i>
                <p className="text-xs text-gray-500 font-medium">{card.label}</p>
              </div>
              <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
            </div>
          ))}
        </div>

        {loading ? (
          <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
            <i className="ri-loader-4-line animate-spin text-gray-400 text-2xl"></i>
            <p className="text-sm text-gray-400 mt-2">Loading analytics...</p>
          </div>
        ) : (
          <>
            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Daily Trend */}
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <h3 className="text-sm font-bold text-gray-900 mb-1">Daily Volume</h3>
                <p className="text-xs text-gray-400 mb-4">Notifications sent per day across all channels</p>
                {dailyData.length === 0 ? (
                  <div className="h-48 flex items-center justify-center text-gray-400 text-sm">No data for this period</div>
                ) : (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={dailyData}>
                        <XAxis
                          dataKey="day"
                          tickFormatter={(v) => new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          tick={{ fontSize: 11, fill: '#9ca3af' }}
                          axisLine={{ stroke: '#f3f4f6' }}
                          tickLine={false}
                        />
                        <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                        <Tooltip
                          contentStyle={{ borderRadius: 10, border: '1px solid #f3f4f6', fontSize: 12 }}
                          labelFormatter={(v) => new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        />
                        <Line type="monotone" dataKey="total" stroke="#10b981" strokeWidth={2} dot={false} name="Total" />
                        <Line type="monotone" dataKey="read" stroke="#3b82f6" strokeWidth={2} dot={false} name="Read" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              {/* Type Breakdown Pie */}
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <h3 className="text-sm font-bold text-gray-900 mb-1">By Type</h3>
                <p className="text-xs text-gray-400 mb-4">Distribution of notification types</p>
                {pieData.length === 0 ? (
                  <div className="h-48 flex items-center justify-center text-gray-400 text-sm">No data for this period</div>
                ) : (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={90}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {pieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Legend
                          formatter={(value: string, entry: any) => (
                            <span style={{ color: entry.color, fontSize: 12 }}>{value}</span>
                          )}
                        />
                        <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #f3f4f6', fontSize: 12 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>

            {/* Delivery Rates by Type */}
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <h3 className="text-sm font-bold text-gray-900 mb-1">Delivery Rates by Type</h3>
              <p className="text-xs text-gray-400 mb-4">
                Percentage of notifications successfully delivered via each channel
              </p>
              {typeData.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-gray-400 text-sm">No data for this period</div>
              ) : (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={typeData} barCategoryGap="20%">
                      <XAxis
                        dataKey="type"
                        tickFormatter={(v) => TYPE_LABELS[v] || v}
                        tick={{ fontSize: 11, fill: '#9ca3af' }}
                        axisLine={{ stroke: '#f3f4f6' }}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: '#9ca3af' }}
                        axisLine={false}
                        tickLine={false}
                        unit="%"
                      />
                      <Tooltip
                        contentStyle={{ borderRadius: 10, border: '1px solid #f3f4f6', fontSize: 12 }}
                        formatter={(value: number, name: string) => [`${value}%`, name === 'read_rate' ? 'Read' : name === 'email_rate' ? 'Email' : 'SMS']}
                      />
                      <Legend
                        formatter={(value: string) =>
                          value === 'read_rate' ? 'Read' : value === 'email_rate' ? 'Email' : 'SMS'
                        }
                      />
                      <Bar dataKey="read_rate" fill="#10b981" radius={[4, 4, 0, 0]} name="read_rate" />
                      <Bar dataKey="email_rate" fill="#3b82f6" radius={[4, 4, 0, 0]} name="email_rate" />
                      <Bar dataKey="sms_rate" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="sms_rate" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Type Detail Table */}
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h3 className="text-sm font-bold text-gray-900">Channel Performance Detail</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-50">
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Type</th>
                      <th className="text-right px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Total</th>
                      <th className="text-right px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Read</th>
                      <th className="text-right px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Read %</th>
                      <th className="text-right px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Emailed</th>
                      <th className="text-right px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Email %</th>
                      <th className="text-right px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">SMS</th>
                      <th className="text-right px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">SMS %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {typeData.map((t) => {
                      const byType = summary?.by_type?.[t.type];
                      const total = byType?.total ?? t.total;
                      const read = byType?.read ?? 0;
                      const emailed = byType?.emailed ?? 0;
                      const sms = byType?.sms ?? 0;
                      return (
                        <tr key={t.type} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-5 py-3">
                            <span className="flex items-center gap-2 text-sm font-medium text-gray-800">
                              <span
                                className="w-2.5 h-2.5 rounded-full inline-block"
                                style={{ backgroundColor: TYPE_COLORS[t.type] || '#6b7280' }}
                              ></span>
                              {TYPE_LABELS[t.type] || t.type}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-right font-semibold text-gray-800">{total}</td>
                          <td className="px-5 py-3 text-right text-gray-500">{read}</td>
                          <td className="px-5 py-3 text-right">
                            <span className={`text-xs font-medium ${t.read_rate >= 50 ? 'text-emerald-600' : 'text-amber-600'}`}>
                              {t.read_rate}%
                            </span>
                          </td>
                          <td className="px-5 py-3 text-right text-gray-500">{emailed}</td>
                          <td className="px-5 py-3 text-right">
                            <span className="text-xs font-medium text-sky-600">{t.email_rate}%</span>
                          </td>
                          <td className="px-5 py-3 text-right text-gray-500">{sms}</td>
                          <td className="px-5 py-3 text-right">
                            <span className="text-xs font-medium text-violet-600">{t.sms_rate}%</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}