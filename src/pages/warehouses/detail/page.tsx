import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/feature/DashboardLayout';
import { type Warehouse, type WarehouseStaff } from '@/mocks/warehouses';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { logAudit } from '@/lib/auditLog';
import {
  fetchWarehousesWithLiveData, fetchWarehouseProductsAndActivity,
  type LiveStats, emptyLiveStats, shiftColor,
  type WarehouseProductRow, type WarehouseActivityItem, type ActivityKind,
} from '../warehouseShared';

const shiftOptions: WarehouseStaff['shift'][] = ['morning', 'evening', 'night', 'Full Day'];

const productStatusConfig: Record<string, { label: string; dot: string; text: string }> = {
  in_stock: { label: 'In Stock', dot: 'bg-emerald-400', text: 'text-emerald-600' },
  low_stock: { label: 'Low Stock', dot: 'bg-amber-400', text: 'text-amber-600' },
  out_of_stock: { label: 'Out of Stock', dot: 'bg-red-400', text: 'text-red-500' },
};

const activityKindConfig: Record<ActivityKind, { icon: string; iconBg: string; iconColor: string; page: string }> = {
  transfer_in: { icon: 'ri-download-2-line', iconBg: 'bg-sky-50', iconColor: 'text-sky-600', page: '/transfers' },
  transfer_out: { icon: 'ri-upload-2-line', iconBg: 'bg-violet-50', iconColor: 'text-violet-600', page: '/transfers' },
  purchase: { icon: 'ri-shopping-cart-2-line', iconBg: 'bg-amber-50', iconColor: 'text-amber-600', page: '/purchases' },
  return: { icon: 'ri-arrow-go-back-line', iconBg: 'bg-red-50', iconColor: 'text-red-500', page: '/returns' },
};

const activityStatusColor: Record<string, string> = {
  requested: 'bg-amber-50 text-amber-700', approved: 'bg-sky-50 text-sky-700', in_transit: 'bg-violet-50 text-violet-700',
  received: 'bg-emerald-50 text-emerald-700', cancelled: 'bg-red-50 text-red-600',
  draft: 'bg-gray-100 text-gray-600', submitted: 'bg-gray-100 text-gray-700', ordered: 'bg-blue-50 text-blue-700',
  pending: 'bg-amber-50 text-amber-700', inspecting: 'bg-amber-50 text-amber-700', restocked: 'bg-emerald-50 text-emerald-700',
  discarded: 'bg-gray-100 text-gray-600', refunded: 'bg-sky-50 text-sky-700',
};

export default function WarehouseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { formatAmount } = useCurrency();
  const { canEdit, canDelete, warehouseScope } = useAuth();
  const showEdit = canEdit('warehouses');
  const showDelete = canDelete('warehouses');
  const [warehouse, setWarehouse] = useState<Warehouse | null>(null);
  const [live, setLive] = useState<LiveStats>(emptyLiveStats);
  const [products, setProducts] = useState<WarehouseProductRow[]>([]);
  const [activity, setActivity] = useState<WarehouseActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [editingInfo, setEditingInfo] = useState(false);
  const [infoForm, setInfoForm] = useState({
    manager: '', managerEmail: '', managerPhone: '', operatingHours: '',
    address: '', city: '', country: '', lastAudit: '', notes: '',
  });
  const [savingInfo, setSavingInfo] = useState(false);
  const [infoError, setInfoError] = useState<string | null>(null);

  const [editingStaff, setEditingStaff] = useState(false);
  const [staffDraft, setStaffDraft] = useState<WarehouseStaff[]>([]);
  const [savingStaff, setSavingStaff] = useState(false);
  const [staffError, setStaffError] = useState<string | null>(null);

  const [allVendors, setAllVendors] = useState<string[]>([]);
  const [editingVendors, setEditingVendors] = useState(false);
  const [vendorsDraft, setVendorsDraft] = useState<string[]>([]);
  const [savingVendors, setSavingVendors] = useState(false);
  const [vendorsError, setVendorsError] = useState<string | null>(null);

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const result = await fetchWarehousesWithLiveData(warehouseScope);
      if (!result) {
        setLoading(false);
        return;
      }
      const match = result.warehouses.find((w) => w.id === id);
      if (!match) {
        // Either the id doesn't exist, or (when scoped) it belongs to a
        // warehouse the current user isn't assigned to.
        setNotFound(true);
        setLoading(false);
        return;
      }
      setWarehouse(match);
      setLive(result.liveStats[match.name] ?? emptyLiveStats);

      const extra = await fetchWarehouseProductsAndActivity(match.name);
      if (extra) {
        setProducts(extra.products);
        setActivity(extra.activity);
      }
      setLoading(false);
    })();
  }, [id, warehouseScope]);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from('vendors').select('name').order('name', { ascending: true });
      if (!error && data) setAllVendors(data.map((v) => v.name as string));
    })();
  }, []);

  const openEditInfo = () => {
    if (!warehouse) return;
    setInfoForm({
      manager: warehouse.manager,
      managerEmail: warehouse.managerEmail,
      managerPhone: warehouse.managerPhone,
      operatingHours: warehouse.operatingHours,
      address: warehouse.address,
      city: warehouse.city,
      country: warehouse.country,
      lastAudit: warehouse.lastAudit,
      notes: warehouse.notes ?? '',
    });
    setInfoError(null);
    setEditingInfo(true);
  };

  const saveInfo = async () => {
    if (!warehouse) return;
    setSavingInfo(true);
    setInfoError(null);
    const { error } = await supabase
      .from('warehouses')
      .update({
        manager: infoForm.manager,
        manager_email: infoForm.managerEmail,
        manager_phone: infoForm.managerPhone,
        operating_hours: infoForm.operatingHours,
        address: infoForm.address,
        city: infoForm.city,
        country: infoForm.country,
        last_audit: infoForm.lastAudit,
        notes: infoForm.notes || null,
      })
      .eq('id', warehouse.id);
    setSavingInfo(false);
    if (error) {
      setInfoError(error.message);
      return;
    }
    setWarehouse({
      ...warehouse,
      manager: infoForm.manager,
      managerEmail: infoForm.managerEmail,
      managerPhone: infoForm.managerPhone,
      operatingHours: infoForm.operatingHours,
      address: infoForm.address,
      city: infoForm.city,
      country: infoForm.country,
      lastAudit: infoForm.lastAudit,
      notes: infoForm.notes || undefined,
    });
    setEditingInfo(false);
    logAudit({ action: 'update', module: 'warehouses', description: `Updated warehouse "${warehouse.name}" info`, referenceId: warehouse.id });
  };

  const openEditStaff = () => {
    if (!warehouse) return;
    setStaffDraft(warehouse.staff.map((s) => ({ ...s })));
    setStaffError(null);
    setEditingStaff(true);
  };

  const addStaffRow = () => setStaffDraft((prev) => [...prev, { name: '', role: '', shift: 'morning' }]);
  const removeStaffRow = (i: number) => setStaffDraft((prev) => prev.filter((_, idx) => idx !== i));
  const updateStaffRow = (i: number, patch: Partial<WarehouseStaff>) =>
    setStaffDraft((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));

  const saveStaff = async () => {
    if (!warehouse) return;
    const cleaned = staffDraft.filter((s) => s.name.trim() && s.role.trim());
    setSavingStaff(true);
    setStaffError(null);
    const { error } = await supabase
      .from('warehouses')
      .update({ staff: cleaned })
      .eq('id', warehouse.id);
    setSavingStaff(false);
    if (error) {
      setStaffError(error.message);
      return;
    }
    setWarehouse({ ...warehouse, staff: cleaned });
    setEditingStaff(false);
    logAudit({ action: 'update', module: 'warehouses', description: `Updated staff list for "${warehouse.name}" (${cleaned.length} staff)`, referenceId: warehouse.id });
  };

  const openEditVendors = () => {
    if (!warehouse) return;
    setVendorsDraft(warehouse.vendorNames ?? []);
    setVendorsError(null);
    setEditingVendors(true);
  };

  const toggleVendorDraft = (name: string) => {
    setVendorsDraft((prev) => (prev.includes(name) ? prev.filter((v) => v !== name) : [...prev, name]));
  };

  const saveVendors = async () => {
    if (!warehouse) return;
    setSavingVendors(true);
    setVendorsError(null);
    const { error } = await supabase
      .from('warehouses')
      .update({ vendor_names: vendorsDraft })
      .eq('id', warehouse.id);
    setSavingVendors(false);
    if (error) {
      setVendorsError(error.message);
      return;
    }
    setWarehouse({ ...warehouse, vendorNames: vendorsDraft });
    setEditingVendors(false);
    logAudit({ action: 'update', module: 'warehouses', description: `Updated approved vendor list for "${warehouse.name}"`, referenceId: warehouse.id });
  };

  const confirmDelete = async () => {
    if (!warehouse) return;
    setDeleting(true);
    setDeleteError(null);
    const { error } = await supabase.from('warehouses').delete().eq('id', warehouse.id);
    setDeleting(false);
    if (error) {
      setDeleteError(error.message);
      return;
    }
    logAudit({ action: 'delete', module: 'warehouses', description: `Deleted warehouse "${warehouse.name}"`, referenceId: warehouse.id });
    navigate('/warehouses');
  };

  // Render nothing while the warehouse is still loading (rather than a
  // spinner) — the guard still prevents the "not found" state below from
  // flashing before the fetch has actually had a chance to resolve.
  if (loading) {
    return null;
  }

  if (notFound || !warehouse) {
    return (
      <DashboardLayout title="Warehouse Details">
        <div className="text-center py-16">
          <i className="ri-building-2-line text-4xl text-gray-300 mb-3 block"></i>
          <p className="text-sm text-gray-500 mb-4">Warehouse not found.</p>
          <button
            onClick={() => navigate('/warehouses')}
            className="text-sm text-emerald-600 font-medium hover:text-emerald-700 cursor-pointer"
          >
            <i className="ri-arrow-left-s-line"></i> Back to Warehouses
          </button>
        </div>
      </DashboardLayout>
    );
  }

  const usagePct = Math.round((warehouse.usedCapacity / warehouse.totalCapacity) * 100);

  return (
    <DashboardLayout title={warehouse.name} subtitle={`${warehouse.type === 'owned' ? 'Owned' : 'Vendor'} warehouse · ${warehouse.city}, ${warehouse.country}`}>
      <div className="flex items-center justify-between mb-5">
        <button
          onClick={() => navigate('/warehouses')}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 font-medium cursor-pointer"
        >
          <i className="ri-arrow-left-s-line text-lg"></i> Back to Warehouses
        </button>
        {showDelete && (
          <button
            onClick={() => { setDeleteError(null); setConfirmingDelete(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
          >
            <i className="ri-delete-bin-line"></i> Delete Warehouse
          </button>
        )}
      </div>

      {/* Capacity summary strip */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5 mb-5">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Storage Capacity</p>
          <span className={`text-sm font-bold ${usagePct >= 85 ? 'text-red-500' : usagePct >= 65 ? 'text-amber-600' : 'text-emerald-600'}`}>{usagePct}% used</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2.5 mb-1.5">
          <div
            className={`h-2.5 rounded-full transition-all ${usagePct >= 85 ? 'bg-red-400' : usagePct >= 65 ? 'bg-amber-400' : 'bg-emerald-500'}`}
            style={{ width: `${usagePct}%` }}
          ></div>
        </div>
        <div className="flex justify-between text-xs text-gray-400">
          <span>{warehouse.usedCapacity.toLocaleString()} units used</span>
          <span>{warehouse.totalCapacity.toLocaleString()} units total</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
          {/* Manager Info */}
          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Warehouse Info</p>
              {showEdit && (
                <button
                  onClick={openEditInfo}
                  className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
                  title="Edit"
                >
                  <i className="ri-edit-line text-xs"></i>
                </button>
              )}
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 flex items-center justify-center bg-emerald-50 rounded-lg flex-shrink-0">
                  <i className="ri-user-settings-line text-emerald-600 text-xs"></i>
                </div>
                <div>
                  <p className="font-semibold text-gray-800">{warehouse.manager}</p>
                  <p className="text-xs text-gray-500">Warehouse Manager</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <i className="ri-mail-line text-gray-400 w-4"></i>
                {warehouse.managerEmail}
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <i className="ri-phone-line text-gray-400 w-4"></i>
                {warehouse.managerPhone}
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <i className="ri-time-line text-gray-400 w-4"></i>
                {warehouse.operatingHours}
              </div>
              <div className="flex items-start gap-2 text-xs text-gray-600">
                <i className="ri-map-pin-line text-gray-400 w-4 flex-shrink-0 mt-0.5"></i>
                {warehouse.address}, {warehouse.city}, {warehouse.country}
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <i className="ri-calendar-check-line text-gray-400 w-4"></i>
                Last audit: {warehouse.lastAudit}
              </div>
            </div>
          </div>

          {/* Staff List */}
          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Staff on Duty</p>
              {showEdit && (
                <button
                  onClick={openEditStaff}
                  className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
                  title="Edit"
                >
                  <i className="ri-edit-line text-xs"></i>
                </button>
              )}
            </div>
            <div className="space-y-2">
              {warehouse.staff.length === 0 && (
                <p className="text-xs text-gray-400">No staff assigned.</p>
              )}
              {warehouse.staff.map((s, i) => (
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

      {/* Approved Vendors */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5 mb-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Approved Vendors</p>
          {showEdit && (
            <button
              onClick={openEditVendors}
              className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
              title="Edit"
            >
              <i className="ri-edit-line text-xs"></i>
            </button>
          )}
        </div>
        {(warehouse.vendorNames ?? []).length === 0 ? (
          <p className="text-xs text-gray-400">No vendors linked yet — the Vendor picker on Add Product will be empty for this warehouse until you add some.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {(warehouse.vendorNames ?? []).map((name) => (
              <span key={name} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                <i className="ri-store-2-line"></i>{name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Live Operations — real counts from products, transfers, purchases, returns */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5 mb-5">
        <div className="flex items-center gap-2 mb-4">
          <i className="ri-pulse-line text-emerald-500"></i>
          <h2 className="text-sm font-bold text-gray-900 tracking-tight">Live Operations</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          {[
            { label: 'Stock Value', value: formatAmount(live.stockValue), icon: 'ri-money-dollar-circle-line', iconBg: 'from-emerald-50 to-emerald-100/60', iconColor: 'text-emerald-600' },
            { label: 'Low Stock', value: live.lowStockCount, icon: 'ri-error-warning-line', iconBg: 'from-amber-50 to-amber-100/60', iconColor: 'text-amber-500' },
            { label: 'Out of Stock', value: live.outOfStockCount, icon: 'ri-close-circle-line', iconBg: 'from-red-50 to-red-100/60', iconColor: 'text-red-500' },
            { label: 'Transfers In', value: live.pendingTransfersIn, icon: 'ri-download-2-line', iconBg: 'from-sky-50 to-sky-100/60', iconColor: 'text-sky-500' },
            { label: 'Transfers Out', value: live.pendingTransfersOut, icon: 'ri-upload-2-line', iconBg: 'from-violet-50 to-violet-100/60', iconColor: 'text-violet-500' },
            { label: 'Active Returns', value: live.activeReturns, icon: 'ri-arrow-go-back-line', iconBg: 'from-orange-50 to-orange-100/60', iconColor: 'text-orange-500' },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-gray-100 p-3 flex flex-col gap-2 hover:shadow-sm hover:border-emerald-200 transition-all duration-200">
              <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${s.iconBg} flex items-center justify-center`}>
                <i className={`${s.icon} ${s.iconColor} text-sm`}></i>
              </div>
              <div>
                <p className="text-lg font-bold text-gray-900 tracking-tight">{s.value}</p>
                <p className="text-xs text-gray-500">{s.label}</p>
              </div>
            </div>
          ))}
        </div>
        {live.pendingPurchases > 0 && (
          <p className="text-xs text-gray-400 mt-3">
            <i className="ri-shopping-cart-2-line mr-1"></i>
            {live.pendingPurchases} pending purchase order{live.pendingPurchases !== 1 ? 's' : ''} worth {formatAmount(live.purchasesValue)}
          </p>
        )}
      </div>

      {/* Products stocked here */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm mb-5 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <i className="ri-archive-stack-line text-emerald-500"></i>
            <h2 className="text-sm font-bold text-gray-900 tracking-tight">Products in this Warehouse</h2>
          </div>
          <span className="text-xs text-gray-400">{products.length} product{products.length !== 1 ? 's' : ''}</span>
        </div>
        {products.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No products stocked in this warehouse.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50/70">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Product</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">SKU</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Category</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Stock</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Status</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {products.map((p) => {
                  const sc = productStatusConfig[p.status] ?? productStatusConfig.in_stock;
                  const pct = Math.min((p.stock / (p.low_stock_threshold * 3 || 1)) * 100, 100);
                  return (
                    <tr key={p.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-3">
                        <p className="font-semibold text-gray-800 leading-tight">{p.name}</p>
                        {p.vendor && <p className="text-xs text-gray-400 mt-0.5">{p.vendor}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-mono text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{p.sku}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{p.category}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 min-w-[90px]">
                          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${sc.dot}`} style={{ width: `${pct}%` }} />
                          </div>
                          <span className="font-bold text-gray-800 w-8 text-right">{p.stock}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className={`flex items-center gap-1.5 ${sc.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`}></span>
                          <span className="text-xs font-medium whitespace-nowrap">{sc.label}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right font-semibold text-gray-700">{formatAmount(p.price)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Activity — every transfer, purchase, and return that references this warehouse */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm mb-5 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <i className="ri-history-line text-emerald-500"></i>
            <h2 className="text-sm font-bold text-gray-900 tracking-tight">Warehouse Activity</h2>
          </div>
          <span className="text-xs text-gray-400">{activity.length} record{activity.length !== 1 ? 's' : ''}</span>
        </div>
        {activity.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No transfers, purchases, or returns reference this warehouse yet.</p>
        ) : (
          <div className="divide-y divide-gray-50 max-h-[420px] overflow-y-auto">
            {activity.map((a) => {
              const cfg = activityKindConfig[a.kind];
              return (
                <button
                  key={`${a.kind}-${a.id}`}
                  onClick={() => navigate(cfg.page)}
                  className="w-full flex items-center gap-3 px-5 py-3 hover:bg-gray-50/50 transition-colors text-left cursor-pointer"
                >
                  <div className={`w-8 h-8 rounded-lg ${cfg.iconBg} flex items-center justify-center flex-shrink-0`}>
                    <i className={`${cfg.icon} ${cfg.iconColor} text-sm`}></i>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{a.label}</p>
                    <p className="text-xs text-gray-400 mt-0.5 truncate capitalize">{a.detail}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    {a.amount !== undefined && a.amount > 0 && (
                      <p className="text-sm font-semibold text-gray-700">{formatAmount(a.amount)}</p>
                    )}
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap capitalize ${activityStatusColor[a.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {a.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Monthly Activity Chart */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5 mb-5">
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          <i className="ri-line-chart-line text-emerald-500"></i>
          <h2 className="text-sm font-bold text-gray-900 tracking-tight">Monthly Activity</h2>
          <div className="ml-4 flex gap-4 text-xs">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span>Inbound</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-sky-400 inline-block"></span>Outbound</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block"></span>Returns</span>
          </div>
        </div>
        <div className="flex items-end gap-6 h-40">
          {warehouse.monthlyActivity.map((m) => {
            const maxVal = Math.max(...warehouse.monthlyActivity.flatMap((a) => [a.inbound, a.outbound, a.returns]), 1);
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
            { label: 'Total Inbound', val: warehouse.monthlyActivity.reduce((s, m) => s + m.inbound, 0), color: 'text-emerald-600' },
            { label: 'Total Outbound', val: warehouse.monthlyActivity.reduce((s, m) => s + m.outbound, 0), color: 'text-sky-600' },
            { label: 'Total Returns', val: warehouse.monthlyActivity.reduce((s, m) => s + m.returns, 0), color: 'text-amber-600' },
          ].map((s) => (
            <div key={s.label}>
              <p className={`text-xl font-bold tracking-tight ${s.color}`}>{s.val}</p>
              <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Notes */}
      {warehouse.notes && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 text-sm text-amber-800">
          <p className="font-semibold mb-1">Notes</p>
          <i className="ri-sticky-note-line mr-1.5"></i>{warehouse.notes}
        </div>
      )}

      {/* Edit Warehouse Info modal */}
      {editingInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
              <h2 className="text-lg font-semibold text-gray-900">Edit Warehouse Info</h2>
              <button onClick={() => setEditingInfo(false)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 cursor-pointer">
                <i className="ri-close-line text-lg"></i>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              {infoError && (
                <div className="px-3 py-2.5 bg-red-50 border border-red-100 rounded-lg text-sm text-red-700 flex items-center gap-2">
                  <i className="ri-error-warning-line"></i>
                  {infoError}
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Manager Name</label>
                  <input type="text" value={infoForm.manager} onChange={(e) => setInfoForm((f) => ({ ...f, manager: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Operating Hours</label>
                  <input type="text" value={infoForm.operatingHours} onChange={(e) => setInfoForm((f) => ({ ...f, operatingHours: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Manager Email</label>
                  <input type="email" value={infoForm.managerEmail} onChange={(e) => setInfoForm((f) => ({ ...f, managerEmail: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Manager Phone</label>
                  <input type="text" value={infoForm.managerPhone} onChange={(e) => setInfoForm((f) => ({ ...f, managerPhone: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                <input type="text" value={infoForm.address} onChange={(e) => setInfoForm((f) => ({ ...f, address: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                {/* <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                  <input type="text" value={infoForm.city} onChange={(e) => setInfoForm((f) => ({ ...f, city: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                  <input type="text" value={infoForm.country} onChange={(e) => setInfoForm((f) => ({ ...f, country: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div> */}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Last Audit Date</label>
                <input type="text" placeholder="YYYY-MM-DD" value={infoForm.lastAudit} onChange={(e) => setInfoForm((f) => ({ ...f, lastAudit: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea rows={3} value={infoForm.notes} onChange={(e) => setInfoForm((f) => ({ ...f, notes: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 flex-shrink-0">
              <button onClick={() => setEditingInfo(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium cursor-pointer">Cancel</button>
              <button onClick={saveInfo} disabled={savingInfo} className="px-5 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors cursor-pointer">
                {savingInfo ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Staff modal */}
      {editingStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
              <h2 className="text-lg font-semibold text-gray-900">Edit Staff on Duty</h2>
              <button onClick={() => setEditingStaff(false)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 cursor-pointer">
                <i className="ri-close-line text-lg"></i>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-3">
              {staffError && (
                <div className="px-3 py-2.5 bg-red-50 border border-red-100 rounded-lg text-sm text-red-700 flex items-center gap-2">
                  <i className="ri-error-warning-line"></i>
                  {staffError}
                </div>
              )}
              {staffDraft.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input type="text" placeholder="Name" value={s.name} onChange={(e) => updateStaffRow(i, { name: e.target.value })}
                    className="flex-1 min-w-0 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  <input type="text" placeholder="Role" value={s.role} onChange={(e) => updateStaffRow(i, { role: e.target.value })}
                    className="flex-1 min-w-0 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  <select value={s.shift} onChange={(e) => updateStaffRow(i, { shift: e.target.value as WarehouseStaff['shift'] })}
                    className="px-2 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
                    {shiftOptions.map((sh) => <option key={sh} value={sh}>{sh.charAt(0).toUpperCase() + sh.slice(1)}</option>)}
                  </select>
                  <button onClick={() => removeStaffRow(i)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors cursor-pointer flex-shrink-0">
                    <i className="ri-delete-bin-line text-sm"></i>
                  </button>
                </div>
              ))}
              <button onClick={addStaffRow} className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-gray-300 text-sm text-gray-500 hover:border-emerald-300 hover:text-emerald-600 transition-colors cursor-pointer">
                <i className="ri-add-line"></i> Add Staff Member
              </button>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 flex-shrink-0">
              <button onClick={() => setEditingStaff(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium cursor-pointer">Cancel</button>
              <button onClick={saveStaff} disabled={savingStaff} className="px-5 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors cursor-pointer">
                {savingStaff ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Vendors modal */}
      {editingVendors && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
              <h2 className="text-lg font-semibold text-gray-900">Approved Vendors</h2>
              <button onClick={() => setEditingVendors(false)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 cursor-pointer">
                <i className="ri-close-line text-lg"></i>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-2">
              {vendorsError && (
                <div className="px-3 py-2.5 bg-red-50 border border-red-100 rounded-lg text-sm text-red-700 flex items-center gap-2">
                  <i className="ri-error-warning-line"></i>
                  {vendorsError}
                </div>
              )}
              <p className="text-xs text-gray-400 mb-2">Select which vendors can supply products for this warehouse.</p>
              {allVendors.length === 0 ? (
                <p className="text-sm text-gray-400">No vendors yet — add one from the Vendors page first.</p>
              ) : (
                allVendors.map((name) => (
                  <label key={name} className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-gray-200 hover:border-gray-300 cursor-pointer">
                    <input type="checkbox" checked={vendorsDraft.includes(name)} onChange={() => toggleVendorDraft(name)} className="rounded" />
                    <span className="text-sm text-gray-700">{name}</span>
                  </label>
                ))
              )}
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 flex-shrink-0">
              <button onClick={() => setEditingVendors(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium cursor-pointer">Cancel</button>
              <button onClick={saveVendors} disabled={savingVendors} className="px-5 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors cursor-pointer">
                {savingVendors ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {confirmingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <i className="ri-delete-bin-line text-red-600"></i>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Delete {warehouse.name}?</h3>
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
              Products, transfers, purchases, and returns that reference "{warehouse.name}" will keep that name on their records — they won't be deleted or reassigned.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmingDelete(false)}
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
