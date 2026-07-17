import { useState, useMemo, useEffect, type MouseEvent } from 'react';
import DashboardLayout from '@/components/feature/DashboardLayout';
import DeliveryStepTracker from './components/DeliveryStepTracker';
import DeliveryDetailModal from './components/DeliveryDetailModal';
import DeliveryFormModal from './components/DeliveryFormModal';
import { deliveryRecords as initialDeliveries, type DeliveryRecord, type DeliveryStep } from '@/mocks/deliveries';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { parseDeliveryItems, deliveryItemsToDetail } from '@/lib/deliveryItems';
import { getReservedQuantities } from '@/lib/stockReservations';
import { moveStockBetweenWarehouses } from '@/lib/stockDeduction';
import { exportToCsv } from '@/lib/exportCsv';
import { logAudit } from '@/lib/auditLog';
import { notifyAdmins } from '@/lib/notifyAdmins';

const stepIndex: Record<DeliveryStep, number> = { prepare: 0, ready: 1, in_transit: 2, delivered: 3 };

const statusConfig = {
  prepare: { label: 'Preparing', cls: 'bg-amber-50 text-amber-700', icon: 'ri-inbox-archive-line' },
  ready: { label: 'Ready', cls: 'bg-violet-50 text-violet-700', icon: 'ri-checkbox-circle-line' },
  in_transit: { label: 'In Transit', cls: 'bg-sky-50 text-sky-700', icon: 'ri-truck-line' },
  delivered: { label: 'Delivered', cls: 'bg-emerald-50 text-emerald-700', icon: 'ri-map-pin-2-line' },
};

type FilterStatus = 'all' | DeliveryStep;

function rowToRecord(row: any): DeliveryRecord {
  const items = parseDeliveryItems(row);

  return {
    id: String(row.id ?? ''),
    transferId: row.transfer_id ?? '',
    fromWarehouse: row.from_warehouse ?? row.warehouse ?? '',
    toWarehouse: row.to_warehouse ?? row.destination ?? '',
    items,
    items_detail: row.items_detail ?? deliveryItemsToDetail(items),
    status: (row.status ?? 'prepare') as DeliveryStep,
    estimatedDelivery: row.estimated_delivery ?? row.estimatedDelivery ?? '',
    timeline: Array.isArray(row.timeline) ? row.timeline : [],
    last_update: row.last_update ?? row.lastUpdate ?? '',
    created_at: row.created_at ?? '',
    driver_name: row.driver_name ?? '',
    vehicle_plate: row.vehicle_plate ?? '',
    departure_time: row.departure_time ?? '',
    arrival_time: row.arrival_time ?? '',
    imageUrl: row.image_url ?? row.imageUrl ?? '',
    notes: row.notes ?? '',
  };
}

function recordToRow(record: DeliveryRecord) {
  return {
    id: record.id,
    transfer_id: record.transferId,
    from_warehouse: record.fromWarehouse,
    to_warehouse: record.toWarehouse,
    warehouse: record.fromWarehouse,
    destination: record.toWarehouse,
    items_detail: record.items_detail || deliveryItemsToDetail(record.items),
    status: record.status,
    estimated_delivery: record.estimatedDelivery,
    timeline: record.timeline,
    last_update: record.last_update,
    created_at: record.created_at,
    driver_name: record.driver_name,
    vehicle_plate: record.vehicle_plate,
    departure_time: record.departure_time,
    arrival_time: record.arrival_time,
    image_url: record.imageUrl,
    notes: record.notes,
  };
}

export default function DeliveriesPage() {
  const { canEdit, canDelete, profile } = useAuth();
  const showEdit = canEdit('deliveries');
  const showDelete = canDelete('deliveries');
  const [deliveries, setDeliveries] = useState<DeliveryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [filterWarehouse, setFilterWarehouse] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedDelivery, setSelectedDelivery] = useState<DeliveryRecord | null>(null);
  const [editingDelivery, setEditingDelivery] = useState<DeliveryRecord | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ left: number; top: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from('deliveries')
        .select('*')
        .order('created_at', { ascending: false });

      if (cancelled) return;
      setDeliveries(!error && data ? (data as any[]).map(rowToRecord) : initialDeliveries);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleToggleMenu = (deliveryId: string, event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 144;
    const menuHeight = 96;
    const left = Math.max(8, Math.min(window.innerWidth - menuWidth - 8, rect.right - menuWidth));
    const top = Math.max(8, Math.min(window.innerHeight - menuHeight - 8, rect.bottom + 8));

    if (openMenuId === deliveryId) {
      setOpenMenuId(null);
      setMenuPosition(null);
      return;
    }

    setOpenMenuId(deliveryId);
    setMenuPosition({ left, top });
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();

    return deliveries.filter((d) => {
      const matchStatus = filterStatus === 'all' || d.status === filterStatus;
      const matchWarehouse = filterWarehouse === 'all' || d.fromWarehouse === filterWarehouse || d.toWarehouse === filterWarehouse;
      const matchSearch =
        d.id.toLowerCase().includes(q) ||
        d.fromWarehouse.toLowerCase().includes(q) ||
        d.toWarehouse.toLowerCase().includes(q) ||
        (d.transferId || '').toLowerCase().includes(q);
      return matchStatus && matchWarehouse && matchSearch;
    });
  }, [deliveries, filterStatus, filterWarehouse, search]);

  const counts = useMemo(() => ({
    all: deliveries.length,
    prepare: deliveries.filter((d) => d.status === 'prepare').length,
    ready: deliveries.filter((d) => d.status === 'ready').length,
    in_transit: deliveries.filter((d) => d.status === 'in_transit').length,
    delivered: deliveries.filter((d) => d.status === 'delivered').length,
  }), [deliveries]);

  const handleAdvance = async (id: string, nextStep: DeliveryStep, note: string, photoUrl?: string) => {
    const now = new Date().toLocaleString('sv').replace('T', ' ').slice(0, 16);
    const target = deliveries.find((d) => d.id === id);
    if (!target) return;

    // Stock only leaves the source warehouse once a delivery actually arrives —
    // 'prepare'/'ready'/'in_transit' just reserve it, never touch real stock.
    if (nextStep === 'delivered') {
      const { error: moveError } = await moveStockBetweenWarehouses(
        target.items.map((item) => ({ productId: item.productId || '', quantity: item.quantity })),
        { fromWarehouse: target.fromWarehouse, toWarehouse: target.toWarehouse, reference: target.id, userName: profile?.full_name || 'Admin' }
      );
      if (moveError) {
        showToast('Cannot mark delivered: ' + moveError);
        return;
      }
    }

    const newTimeline = [
      ...target.timeline,
      { step: nextStep, timestamp: now, note, completedBy: profile?.full_name || 'Admin', photoUrl },
    ];

    await supabase
      .from('deliveries')
      .update({ status: nextStep, timeline: newTimeline, last_update: now })
      .eq('id', id);

    setDeliveries((prev) =>
      prev.map((d) => {
        if (d.id !== id) return d;
        const updated: DeliveryRecord = { ...d, status: nextStep, timeline: newTimeline, last_update: now };
        if (selectedDelivery?.id === id) setSelectedDelivery(updated);
        return updated;
      })
    );
    showToast(`Delivery advanced to: ${nextStep.replace('_', ' ')}`);
    logAudit({ action: 'update', module: 'deliveries', description: `Delivery ${id} advanced to ${nextStep.replace('_', ' ')}`, referenceId: id });
  };

  const handleCreateDelivery = async (record: DeliveryRecord) => {
    await supabase.from('deliveries').insert(recordToRow(record));
    setDeliveries((prev) => [record, ...prev]);
    setShowCreateModal(false);
    showToast('Delivery created successfully.');
    logAudit({ action: 'create', module: 'deliveries', description: `Created delivery ${record.id}`, referenceId: record.id });
    notifyAdmins(
      'new_delivery',
      'New Delivery',
      `Delivery ${record.id} from ${record.fromWarehouse} to ${record.toWarehouse} has been created.`,
      { delivery_id: record.id }
    );
  };

  const handleSaveDelivery = async (record: DeliveryRecord) => {
    await supabase.from('deliveries').update(recordToRow(record)).eq('id', record.id);
    setDeliveries((prev) => prev.map((d) => (d.id === record.id ? record : d)));
    if (selectedDelivery?.id === record.id) setSelectedDelivery(record);
    setEditingDelivery(null);
    showToast('Delivery updated successfully.');
    logAudit({ action: 'update', module: 'deliveries', description: `Updated delivery ${record.id}`, referenceId: record.id });
  };

  const handleDeleteDelivery = async (record: DeliveryRecord) => {
    const ok = window.confirm(`Delete ${record.id}?`);
    if (!ok) return;

    await supabase.from('deliveries').delete().eq('id', record.id);
    setDeliveries((prev) => prev.filter((d) => d.id !== record.id));
    if (selectedDelivery?.id === record.id) setSelectedDelivery(null);
    showToast('Delivery deleted.');
    logAudit({ action: 'delete', module: 'deliveries', description: `Deleted delivery ${record.id}`, referenceId: record.id });
  };

  const statusOptions: { key: FilterStatus; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'prepare', label: 'Preparing' },
    { key: 'ready', label: 'Ready' },
    { key: 'in_transit', label: 'In Transit' },
    { key: 'delivered', label: 'Delivered' },
  ];

  const availableWarehouses = useMemo(
    () => [...new Set(deliveries.flatMap((d) => [d.fromWarehouse, d.toWarehouse]).filter(Boolean))],
    [deliveries]
  );

  return (
    <DashboardLayout title="Deliveries" subtitle="Track shipments, advance delivery stages, and confirm arrivals.">
      {toast && (
        <div className="fixed top-5 right-5 z-[100] flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium bg-emerald-500 text-white shadow-lg">
          <i className="ri-check-line text-base"></i> {toast}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        {([
          { key: 'prepare', label: 'Preparing', value: counts.prepare },
          { key: 'ready', label: 'Ready', value: counts.ready },
          { key: 'in_transit', label: 'In Transit', value: counts.in_transit },
          { key: 'delivered', label: 'Delivered', value: counts.delivered },
        ] as { key: DeliveryStep; label: string; value: number }[]).map((kpi) => {
          const cfg = statusConfig[kpi.key];
          return (
            <div
              key={kpi.key}
              onClick={() => setFilterStatus(kpi.key)}
              className={`bg-white rounded-xl px-5 py-4 flex items-center gap-4 cursor-pointer transition-all border-2 ${filterStatus === kpi.key ? 'border-emerald-300' : 'border-transparent hover:border-gray-200'}`}
            >
              <div className={`w-10 h-10 flex items-center justify-center rounded-lg ${cfg.cls}`}>
                <i className={`${cfg.icon} text-lg`}></i>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 tracking-tight">{kpi.value}</p>
                <p className="text-xs text-gray-400">{kpi.label}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-white rounded-2xl">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 px-6 py-4 border-b border-gray-100">
          <div className="relative">
            <div className="w-4 h-4 flex items-center justify-center absolute left-3 top-1/2 -translate-y-1/2">
              <i className="ri-search-line text-gray-400 text-sm"></i>
            </div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search transfer ID, warehouse..."
              className="pl-9 pr-4 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg w-60 focus:outline-none focus:ring-2 focus:ring-emerald-200"
            />
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
              className="py-2 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200 cursor-pointer text-gray-600"
            >
              {statusOptions.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label} ({option.key === 'all' ? counts.all : counts[option.key as DeliveryStep]})
                </option>
              ))}
            </select>

            <select
              value={filterWarehouse}
              onChange={(e) => setFilterWarehouse(e.target.value)}
              className="py-2 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200 cursor-pointer text-gray-600"
            >
              <option value="all">All Warehouses</option>
              {availableWarehouses.map((warehouse) => (
                <option key={warehouse} value={warehouse}>{warehouse}</option>
              ))}
            </select>

            <button
              onClick={() => exportToCsv('deliveries', filtered, [
                { header: 'ID', value: (d) => d.id },
                { header: 'From Warehouse', value: (d) => d.fromWarehouse },
                { header: 'To Warehouse', value: (d) => d.toWarehouse },
                { header: 'Status', value: (d) => d.status },
                { header: 'Items', value: (d) => d.items.map((i) => `${i.productName} x${i.quantity}`).join('; ') },
                { header: 'Driver', value: (d) => d.driver_name || '' },
                { header: 'Vehicle Plate', value: (d) => d.vehicle_plate || '' },
                { header: 'Estimated Delivery', value: (d) => d.estimatedDelivery },
                { header: 'Notes', value: (d) => d.notes || '' },
                { header: 'Created At', value: (d) => d.created_at },
                { header: 'Last Update', value: (d) => d.last_update },
              ])}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer whitespace-nowrap"
            >
              <i className="ri-download-2-line"></i> Export
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 cursor-pointer whitespace-nowrap"
            >
              <i className="ri-add-line"></i> Add Delivery
            </button>
          </div>
        </div>

        {(
          <div className="p-5 grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((delivery) => {
              const cfg = statusConfig[delivery.status];
              const canAdvance = delivery.status !== 'delivered';
              const totalItems = delivery.items.reduce((sum, item) => sum + item.quantity, 0);

              return (
                <div key={delivery.id} className="relative border border-gray-100 rounded-2xl shadow-sm p-4 hover:border-emerald-200 transition-all cursor-pointer group" onClick={() => setSelectedDelivery(delivery)}>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-gray-800">{delivery.transferId || delivery.id}</span>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cfg.cls}`}>{cfg.label}</span>
                      </div>
                      <p className="text-sm font-medium text-gray-700 mt-0.5 flex items-center gap-1.5">
                        {delivery.fromWarehouse}
                        <i className="ri-arrow-right-line text-gray-300 text-xs"></i>
                        {delivery.toWarehouse}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      {canAdvance ? (
                        <div className="w-7 h-7 flex items-center justify-center rounded-lg bg-emerald-50 opacity-0 group-hover:opacity-100 transition-opacity">
                          <i className="ri-arrow-right-line text-emerald-600 text-sm"></i>
                        </div>
                      ) : (
                        <div className="w-7 h-7 flex items-center justify-center">
                          <i className="ri-check-double-line text-emerald-500 text-lg"></i>
                        </div>
                      )}
                      {(showEdit || showDelete) && (
                        <button
                          onClick={(e) => handleToggleMenu(delivery.id, e)}
                          className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-400 transition-colors cursor-pointer"
                        >
                          <i className="ri-more-2-line text-sm"></i>
                        </button>
                      )}
                    </div>
                  </div>

                  {openMenuId === delivery.id && menuPosition && (showEdit || showDelete) && (
                    <div
                      className="fixed w-36 bg-white border border-gray-100 rounded-2xl shadow-sm z-[60] py-1 shadow-md"
                      style={{ left: menuPosition.left, top: menuPosition.top }}
                      onMouseLeave={() => {
                        setOpenMenuId(null);
                        setMenuPosition(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {showEdit && (
                        <button
                          onClick={() => {
                            setEditingDelivery(delivery);
                            setOpenMenuId(null);
                            setMenuPosition(null);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer"
                        >
                          <i className="ri-edit-line text-gray-400"></i> Edit
                        </button>
                      )}
                      {showDelete && (
                        <button
                          onClick={() => {
                            handleDeleteDelivery(delivery);
                            setOpenMenuId(null);
                            setMenuPosition(null);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 cursor-pointer"
                        >
                          <i className="ri-delete-bin-line text-red-400"></i> Delete
                        </button>
                      )}
                    </div>
                  )}

                  <div className="mb-4">
                    <DeliveryStepTracker currentStatus={delivery.status} compact />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <div className="w-3.5 h-3.5 flex items-center justify-center">
                        <i className="ri-truck-line text-gray-400"></i>
                      </div>
                      <span className="font-mono">{delivery.id}</span>
                      {delivery.driver_name && (
                        <>
                          <span className="text-gray-300">-</span>
                          <span>{delivery.driver_name}</span>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <div className="w-3.5 h-3.5 flex items-center justify-center">
                        <i className="ri-box-3-line text-gray-400"></i>
                      </div>
                      <span>{totalItems} item{totalItems !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <div className="w-3.5 h-3.5 flex items-center justify-center">
                        <i className="ri-calendar-line text-gray-400"></i>
                      </div>
                      <span>Est. {delivery.estimatedDelivery}</span>
                    </div>
                  </div>

                  {delivery.timeline.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <p className="text-xs text-gray-400">
                        <i className="ri-time-line mr-1"></i>
                        Last: {delivery.timeline[delivery.timeline.length - 1].timestamp}
                      </p>
                    </div>
                  )}

                  <div className="mt-3">
                    <div className="w-full h-1 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-400 rounded-full transition-all duration-500"
                        style={{ width: `${((stepIndex[delivery.status] + 1) / 4) * 100}%` }}
                      ></div>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">Step {stepIndex[delivery.status] + 1} of 4</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <i className="ri-loader-4-line animate-spin text-3xl mb-3"></i>
            <p className="text-sm">Loading deliveries…</p>
          </div>
        ) : filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <div className="w-12 h-12 flex items-center justify-center mb-3">
              <i className="ri-truck-line text-4xl"></i>
            </div>
            <p className="text-sm">No deliveries match your current filter.</p>
            <button onClick={() => { setSearch(''); setFilterStatus('all'); setFilterWarehouse('all'); }} className="mt-3 text-xs text-emerald-600 hover:underline cursor-pointer">
              Clear filters
            </button>
          </div>
        )}

        <div className="px-6 py-3 border-t border-gray-50 flex items-center justify-between">
          <p className="text-xs text-gray-400">Showing {filtered.length} of {deliveries.length} deliveries</p>
          <p className="text-xs text-gray-400">Last updated: {new Date().toLocaleString('en-MY', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
        </div>
      </div>

      {selectedDelivery && (
        <DeliveryDetailModal
          delivery={selectedDelivery}
          onClose={() => setSelectedDelivery(null)}
          onAdvance={handleAdvance}
        />
      )}
      {showCreateModal && (
        <DeliveryFormModal
          onClose={() => setShowCreateModal(false)}
          onSave={handleCreateDelivery}
        />
      )}
      {editingDelivery && (
        <DeliveryFormModal
          delivery={editingDelivery}
          onClose={() => setEditingDelivery(null)}
          onSave={handleSaveDelivery}
        />
      )}
    </DashboardLayout>
  );
}
