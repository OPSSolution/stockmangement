import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/feature/DashboardLayout';
import { type Warehouse } from '@/mocks/warehouses';
import WarehouseCard from './components/WarehouseCard';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { fetchWarehousesWithLiveData, type LiveStats, emptyLiveStats } from './warehouseShared';

const emptyForm = {
  name: '', type: 'owned' as Warehouse['type'], address: '', city: '', country: 'Malaysia',
  manager: '', managerEmail: '', managerPhone: '', operatingHours: '', totalCapacity: '1000',
};

export default function WarehousesPage() {
  const navigate = useNavigate();
  const { formatAmount } = useCurrency();
  const { canEdit, canDelete } = useAuth();
  const showEdit = canEdit('warehouses');
  const showDelete = canDelete('warehouses');
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [liveStats, setLiveStats] = useState<Record<string, LiveStats>>({});
  const [loading, setLoading] = useState(true);

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Warehouse | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const result = await fetchWarehousesWithLiveData();
    if (result) {
      setWarehouses(result.warehouses);
      setLiveStats(result.liveStats);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const liveFor = (name: string | undefined) => liveStats[name ?? ''] ?? emptyLiveStats;

  const openCreate = () => {
    setForm(emptyForm);
    setFormError(null);
    setShowCreate(true);
  };

  const createWarehouse = async () => {
    if (!form.name.trim()) {
      setFormError('Name and city are required.');
      return;
    }
    setSaving(true);
    setFormError(null);

    const nextNum = warehouses.length + 1;
    const id = `WH${String(nextNum).padStart(3, '0')}`;

    const { error } = await supabase.from('warehouses').insert({
      id,
      name: form.name.trim(),
      type: form.type,
      address: form.address,
      city: form.city,
      country: form.country,
      manager: form.manager,
      manager_email: form.managerEmail,
      manager_phone: form.managerPhone,
      operating_hours: form.operatingHours,
      total_capacity: Number(form.totalCapacity) || 0,
      used_capacity: 0,
      total_skus: 0,
      total_units: 0,
      inbound_today: 0,
      outbound_today: 0,
      pending_pickups: 0,
      last_audit: new Date().toISOString().slice(0, 10),
      zones: [],
      staff: [],
      monthly_activity: [],
    });

    setSaving(false);
    if (error) {
      setFormError(error.message);
      return;
    }
    setShowCreate(false);
    load();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    const { error } = await supabase.from('warehouses').delete().eq('id', deleteTarget.id);
    setDeleting(false);
    if (error) {
      setDeleteError(error.message);
      return;
    }
    setDeleteTarget(null);
    load();
  };

  const usagePct = (w: Warehouse) => Math.round((w.usedCapacity / w.totalCapacity) * 100);

  const comparisonRows = warehouses.length >= 2 ? [
    { label: 'Total Capacity', get: (w: Warehouse) => w.totalCapacity, fmt: (v: number) => `${v.toLocaleString()} units`, higherIsBetter: true },
    { label: 'Used Capacity', get: (w: Warehouse) => usagePct(w), fmt: (v: number) => `${v}%`, higherIsBetter: false },
    { label: 'Total SKUs', get: (w: Warehouse) => w.totalSkus, fmt: (v: number) => `${v}`, higherIsBetter: true },
    { label: 'Total Units', get: (w: Warehouse) => w.totalUnits, fmt: (v: number) => v.toLocaleString(), higherIsBetter: true },
    { label: 'Stock Value', get: (w: Warehouse) => liveFor(w.name).stockValue, fmt: (v: number) => formatAmount(v), higherIsBetter: true },
    { label: 'Inbound Today', get: (w: Warehouse) => w.inboundToday, fmt: (v: number) => `${v}`, higherIsBetter: true },
    { label: 'Outbound Today', get: (w: Warehouse) => w.outboundToday, fmt: (v: number) => `${v}`, higherIsBetter: true },
    { label: 'Staff Count', get: (w: Warehouse) => w.staff.length, fmt: (v: number) => `${v}`, higherIsBetter: true },
  ] : [];

  return (
    <DashboardLayout title="Warehouses" subtitle="Click a warehouse to see its full details">
      <div className="flex items-center justify-end mb-5">
        {showEdit && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors cursor-pointer"
          >
            <i className="ri-add-line"></i> Create Warehouse
          </button>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12 text-gray-400">
          <div className="w-8 h-8 flex items-center justify-center mr-3">
            <i className="ri-loader-4-line animate-spin text-xl"></i>
          </div>
          <span className="text-sm">Loading warehouses...</span>
        </div>
      )}

      {!loading && warehouses.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <i className="ri-building-2-line text-4xl mb-2 block"></i>
          <p className="text-sm">No warehouses yet.</p>
        </div>
      )}

      {!loading && warehouses.length > 0 && (
        <>
          {/* Warehouse cards — click to open full details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
            {warehouses.map((w) => (
              <WarehouseCard
                key={w.id}
                warehouse={w}
                onDelete={showDelete ? () => setDeleteTarget(w) : undefined}
              />
            ))}
          </div>

          {/* Head-to-head comparison */}
          {comparisonRows.length > 0 && (
            <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                <i className="ri-bar-chart-grouped-line text-emerald-500"></i>
                <h2 className="text-sm font-bold text-gray-900 tracking-tight">Warehouse Comparison</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Metric</th>
                      {warehouses.map((w) => (
                        <th key={w.id} className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{w.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {comparisonRows.map((row) => {
                      const values = warehouses.map((w) => row.get(w));
                      const best = row.higherIsBetter ? Math.max(...values) : Math.min(...values);
                      return (
                        <tr key={row.label} className="hover:bg-gray-50/40">
                          <td className="px-5 py-3 text-gray-600 font-medium">{row.label}</td>
                          {warehouses.map((w, i) => (
                            <td key={w.id} className="px-4 py-3 text-center">
                              <span className={`font-semibold ${values[i] === best ? 'text-emerald-700' : 'text-gray-600'}`}>{row.fmt(values[i])}</span>
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Create Warehouse modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
              <h2 className="text-lg font-semibold text-gray-900">Create Warehouse</h2>
              <button onClick={() => setShowCreate(false)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 cursor-pointer">
                <i className="ri-close-line text-lg"></i>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              {formError && (
                <div className="px-3 py-2.5 bg-red-50 border border-red-100 rounded-lg text-sm text-red-700 flex items-center gap-2">
                  <i className="ri-error-warning-line"></i>
                  {formError}
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Warehouse Name</label>
                  <input type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. North Distribution Center"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                  <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as Warehouse['type'] }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
                    <option value="owned">Owned</option>
                    <option value="vendor">Vendor</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                <input type="text" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              <div className="grid grid-cols-2 gap-4">
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Manager Name</label>
                  <input type="text" value={form.manager} onChange={(e) => setForm((f) => ({ ...f, manager: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Total Capacity (units)</label>
                  <input type="number" value={form.totalCapacity} onChange={(e) => setForm((f) => ({ ...f, totalCapacity: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Manager Email</label>
                  <input type="email" value={form.managerEmail} onChange={(e) => setForm((f) => ({ ...f, managerEmail: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Manager Phone</label>
                  <input type="text" value={form.managerPhone} onChange={(e) => setForm((f) => ({ ...f, managerPhone: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Operating Hours</label>
                <input type="text" value={form.operatingHours} onChange={(e) => setForm((f) => ({ ...f, operatingHours: e.target.value }))}
                  placeholder="e.g. Mon–Sat, 8:00 AM – 8:00 PM"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 flex-shrink-0">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium cursor-pointer">Cancel</button>
              <button onClick={createWarehouse} disabled={saving} className="px-5 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors cursor-pointer">
                {saving ? 'Creating...' : 'Create Warehouse'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <i className="ri-delete-bin-line text-red-600"></i>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Delete {deleteTarget.name}?</h3>
                <p className="text-sm text-gray-500">This action cannot be undone.</p>
              </div>
            </div>
            {deleteError && (
              <div className="px-3 py-2.5 bg-red-50 border border-red-100 rounded-lg text-sm text-red-700 flex items-center gap-2 mb-4">
                <i className="ri-error-warning-line"></i>
                {deleteError}
              </div>
            )}
            <p className="text-xs text-gray-400 mb-4">
              Products, transfers, purchases, and returns that reference "{deleteTarget.name}" will keep that name on their records — they won't be deleted or reassigned.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => { setDeleteTarget(null); setDeleteError(null); }}
                className="flex-1 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="flex-1 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 cursor-pointer"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
