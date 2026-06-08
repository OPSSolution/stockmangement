import { useState, useEffect } from 'react';
import DashboardLayout from '@/components/feature/DashboardLayout';
import { type Warehouse } from '@/mocks/warehouses';
import WarehouseCard from './components/WarehouseCard';
import { supabase } from '@/lib/supabase';

const zoneTypeConfig: Record<string, { color: string; label: string }> = {
  storage: { color: 'bg-emerald-500', label: 'Storage' },
  receiving: { color: 'bg-sky-500', label: 'Receiving' },
  shipping: { color: 'bg-violet-500', label: 'Shipping' },
  returns: { color: 'bg-amber-400', label: 'Returns' },
  staging: { color: 'bg-orange-400', label: 'Staging' },
};

const shiftColor = { morning: 'bg-amber-100 text-amber-700', evening: 'bg-violet-100 text-violet-700', night: 'bg-gray-200 text-gray-600' };

function mapWarehouse(row: Record<string, unknown>): Warehouse {
  return {
    id: row.id as string,
    name: row.name as string,
    type: row.type as Warehouse['type'],
    city: row.city as string,
    address: row.address as string,
    manager: row.manager as string,
    managerEmail: row.manager_email as string,
    managerPhone: row.manager_phone as string,
    operatingHours: row.operating_hours as string,
    totalCapacity: row.total_capacity as number,
    usedCapacity: row.used_capacity as number,
    totalSkus: row.total_skus as number,
    totalUnits: row.total_units as number,
    inboundToday: row.inbound_today as number,
    outboundToday: row.outbound_today as number,
    lastAudit: row.last_audit as string,
    notes: row.notes as string | undefined,
    zones: (row.zones as unknown as Warehouse['zones']) || [],
    staff: (row.staff as unknown as Warehouse['staff']) || [],
    monthlyActivity: (row.monthly_activity as unknown as Warehouse['monthlyActivity']) || [],
    country: (row.country as string) || 'Malaysia',
    pendingPickups: (row.pending_pickups as number) || 0,
  };
}

export default function WarehousesPage() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    fetchWarehouses();
  }, []);

  const fetchWarehouses = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('warehouses').select('*');
    if (error) {
      console.error(error);
    } else {
      const mapped = (data || []).map(mapWarehouse);
      setWarehouses(mapped);
      if (mapped.length > 0 && !selectedId) setSelectedId(mapped[0].id);
    }
    setLoading(false);
  };

  const selected = warehouses.find((w) => w.id === selectedId) ?? warehouses[0];
  const other = warehouses.find((w) => w.id !== selectedId) ?? warehouses[1];

  const usagePct = (w: typeof warehouses[0]) => Math.round((w.usedCapacity / w.totalCapacity) * 100);

  return (
    <DashboardLayout title="Warehouses" subtitle="Capacity overview, zone management, and warehouse comparison">
      {loading && (
        <div className="flex items-center justify-center py-12 text-gray-400">
          <div className="w-8 h-8 flex items-center justify-center mr-3">
            <i className="ri-loader-4-line animate-spin text-xl"></i>
          </div>
          <span className="text-sm">Loading warehouses...</span>
        </div>
      )}

      {!loading && warehouses.length > 0 && (
        <>
          {/* Top Comparison Strip */}
          <div className="grid grid-cols-2 gap-5 mb-6">
            {warehouses.map((w) => (
              <WarehouseCard
                key={w.id}
                warehouse={w}
                isSelected={selectedId === w.id}
                onClick={() => setSelectedId(w.id)}
              />
            ))}
          </div>

          {/* Head-to-head comparison */}
          <div className="bg-white border border-gray-100 rounded-xl mb-6 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
              <i className="ri-bar-chart-grouped-line text-emerald-500"></i>
              <h2 className="text-sm font-bold text-gray-900">BM vs Vendor Warehouse — Side-by-Side</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-40">Metric</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{warehouses[0]?.name}</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{warehouses[1]?.name}</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Advantage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {[
                    { label: 'Total Capacity', v1: `${warehouses[0]?.totalCapacity.toLocaleString()} units`, v2: `${warehouses[1]?.totalCapacity.toLocaleString()} units`, winner: (warehouses[0]?.totalCapacity ?? 0) > (warehouses[1]?.totalCapacity ?? 0) ? 0 : 1 },
                    { label: 'Used Capacity', v1: `${usagePct(warehouses[0])}%`, v2: `${usagePct(warehouses[1])}%`, winner: usagePct(warehouses[0]) < usagePct(warehouses[1]) ? 0 : 1 },
                    { label: 'Total SKUs', v1: `${warehouses[0]?.totalSkus}`, v2: `${warehouses[1]?.totalSkus}`, winner: (warehouses[0]?.totalSkus ?? 0) > (warehouses[1]?.totalSkus ?? 0) ? 0 : 1 },
                    { label: 'Total Units', v1: warehouses[0]?.totalUnits.toLocaleString() ?? '0', v2: warehouses[1]?.totalUnits.toLocaleString() ?? '0', winner: (warehouses[0]?.totalUnits ?? 0) > (warehouses[1]?.totalUnits ?? 0) ? 0 : 1 },
                    { label: 'Inbound Today', v1: `${warehouses[0]?.inboundToday}`, v2: `${warehouses[1]?.inboundToday}`, winner: (warehouses[0]?.inboundToday ?? 0) > (warehouses[1]?.inboundToday ?? 0) ? 0 : 1 },
                    { label: 'Outbound Today', v1: `${warehouses[0]?.outboundToday}`, v2: `${warehouses[1]?.outboundToday}`, winner: (warehouses[0]?.outboundToday ?? 0) > (warehouses[1]?.outboundToday ?? 0) ? 0 : 1 },
                    { label: 'Staff Count', v1: `${warehouses[0]?.staff.length}`, v2: `${warehouses[1]?.staff.length}`, winner: (warehouses[0]?.staff.length ?? 0) > (warehouses[1]?.staff.length ?? 0) ? 0 : 1 },
                    { label: 'Zones', v1: `${warehouses[0]?.zones.length}`, v2: `${warehouses[1]?.zones.length}`, winner: (warehouses[0]?.zones.length ?? 0) >= (warehouses[1]?.zones.length ?? 0) ? 0 : 1 },
                  ].map((row) => (
                    <tr key={row.label} className="hover:bg-gray-50/40">
                      <td className="px-5 py-3 text-gray-600 font-medium">{row.label}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`font-semibold ${row.winner === 0 ? 'text-emerald-700' : 'text-gray-600'}`}>{row.v1}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`font-semibold ${row.winner === 1 ? 'text-emerald-700' : 'text-gray-600'}`}>{row.v2}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200 whitespace-nowrap">
                          {row.winner === 0 ? warehouses[0]?.name : warehouses[1]?.name}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Selected Warehouse Detail */}
          {selected && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
              {/* Zone Management */}
              <div className="lg:col-span-2 bg-white border border-gray-100 rounded-xl">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <i className="ri-layout-grid-line text-emerald-500"></i>
                    <h2 className="text-sm font-bold text-gray-900">{selected.name} — Zone Management</h2>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    {Object.entries(zoneTypeConfig).map(([key, val]) => (
                      <span key={key} className="flex items-center gap-1">
                        <span className={`w-2 h-2 rounded-full inline-block ${val.color}`}></span>
                        {val.label}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="p-5 space-y-3">
                  {selected.zones.map((zone) => {
                    const pct = Math.round((zone.used / zone.capacity) * 100);
                    const cfg = zoneTypeConfig[zone.type] ?? { color: 'bg-gray-400', label: zone.type };
                    const barColor = pct >= 85 ? 'bg-red-400' : pct >= 65 ? 'bg-amber-400' : cfg.color;
                    return (
                      <div key={zone.id} className="flex items-center gap-4 p-3 bg-gray-50/60 rounded-xl">
                        <div className={`w-2.5 h-10 rounded-full flex-shrink-0 ${cfg.color}`}></div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1.5">
                            <p className="text-sm font-semibold text-gray-800 truncate">{zone.name}</p>
                            <span className="text-xs text-gray-500 flex-shrink-0 ml-2">{zone.used} / {zone.capacity} units</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div className={`${barColor} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }}></div>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0 w-16">
                          <p className={`text-sm font-bold ${pct >= 85 ? 'text-red-500' : pct >= 65 ? 'text-amber-600' : 'text-emerald-600'}`}>{pct}%</p>
                          {zone.skuCount > 0 && <p className="text-xs text-gray-400">{zone.skuCount} SKUs</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Staff & Info Panel */}
              <div className="space-y-4">
                {/* Manager Info */}
                <div className="bg-white border border-gray-100 rounded-xl p-5">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Warehouse Info</p>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-start gap-3">
                      <div className="w-7 h-7 flex items-center justify-center bg-emerald-50 rounded-lg flex-shrink-0">
                        <i className="ri-user-settings-line text-emerald-600 text-xs"></i>
                      </div>
                      <div>
                        <p className="font-semibold text-gray-800">{selected.manager}</p>
                        <p className="text-xs text-gray-500">Warehouse Manager</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-600">
                      <i className="ri-mail-line text-gray-400 w-4"></i>
                      {selected.managerEmail}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-600">
                      <i className="ri-phone-line text-gray-400 w-4"></i>
                      {selected.managerPhone}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-600">
                      <i className="ri-time-line text-gray-400 w-4"></i>
                      {selected.operatingHours}
                    </div>
                    <div className="flex items-start gap-2 text-xs text-gray-600">
                      <i className="ri-map-pin-line text-gray-400 w-4 flex-shrink-0 mt-0.5"></i>
                      {selected.address}, {selected.city}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-600">
                      <i className="ri-calendar-check-line text-gray-400 w-4"></i>
                      Last audit: {selected.lastAudit}
                    </div>
                  </div>
                </div>

                {/* Staff List */}
                <div className="bg-white border border-gray-100 rounded-xl p-5">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Staff on Duty</p>
                  <div className="space-y-2">
                    {selected.staff.map((s, i) => (
                      <div key={i} className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                            <i className="ri-user-line text-gray-500 text-xs"></i>
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-gray-800">{s.name}</p>
                            <p className="text-xs text-gray-400">{s.role}</p>
                          </div>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${shiftColor[s.shift]}`}>
                          {s.shift.charAt(0).toUpperCase() + s.shift.slice(1)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Monthly Activity Chart (Visual Bar) */}
          {selected && (
            <div className="bg-white border border-gray-100 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-5">
                <i className="ri-line-chart-line text-emerald-500"></i>
                <h2 className="text-sm font-bold text-gray-900">Monthly Activity — {selected.name}</h2>
                <div className="ml-4 flex gap-4 text-xs">
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span>Inbound</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-sky-400 inline-block"></span>Outbound</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block"></span>Returns</span>
                </div>
              </div>
              <div className="flex items-end gap-6 h-40">
                {selected.monthlyActivity.map((m) => {
                  const maxVal = Math.max(...selected.monthlyActivity.flatMap((a) => [a.inbound, a.outbound, a.returns]));
                  const toH = (v: number) => Math.max(4, Math.round((v / maxVal) * 130));
                  return (
                    <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                      <div className="flex items-end gap-1 w-full justify-center">
                        <div title={`Inbound: ${m.inbound}`} className="flex-1 bg-emerald-500 rounded-t cursor-pointer hover:opacity-80 transition-opacity" style={{ height: `${toH(m.inbound)}px` }}></div>
                        <div title={`Outbound: ${m.outbound}`} className="flex-1 bg-sky-400 rounded-t cursor-pointer hover:opacity-80 transition-opacity" style={{ height: `${toH(m.outbound)}px` }}></div>
                        <div title={`Returns: ${m.returns}`} className="flex-1 bg-amber-400 rounded-t cursor-pointer hover:opacity-80 transition-opacity" style={{ height: `${toH(m.returns)}px` }}></div>
                      </div>
                      <p className="text-xs text-gray-500 font-medium">{m.month}</p>
                      <p className="text-xs text-gray-400">{m.inbound + m.outbound}</p>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-3 gap-4 text-center text-sm">
                {[
                  { label: 'Total Inbound', val: selected.monthlyActivity.reduce((s, m) => s + m.inbound, 0), color: 'text-emerald-600' },
                  { label: 'Total Outbound', val: selected.monthlyActivity.reduce((s, m) => s + m.outbound, 0), color: 'text-sky-600' },
                  { label: 'Total Returns', val: selected.monthlyActivity.reduce((s, m) => s + m.returns, 0), color: 'text-amber-600' },
                ].map((s) => (
                  <div key={s.label}>
                    <p className={`text-xl font-bold ${s.color}`}>{s.val}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          {(selected?.notes || other?.notes) && (
            <div className="grid grid-cols-2 gap-5 mt-5">
              {[selected, other].filter(Boolean).map((w) => w?.notes ? (
                <div key={w.id} className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 text-sm text-amber-800">
                  <p className="font-semibold mb-1">{w.name}</p>
                  <i className="ri-sticky-note-line mr-1.5"></i>{w.notes}
                </div>
              ) : null)}
            </div>
          )}
        </>
      )}
    </DashboardLayout>
  );
}