import { useState, useMemo, useEffect, type MouseEvent } from 'react';
import DashboardLayout from '@/components/feature/DashboardLayout';
import OrderStatusBadge from './components/OrderStatusBadge';
import OrderDetailModal from './components/OrderDetailModal';
import OrderFormModal from './components/OrderFormModal';
import { Order, OrderStatus } from '@/mocks/orders';
import type { Product } from '@/mocks/inventory';
import { supabase } from '@/lib/supabase';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useAuth } from '@/contexts/AuthContext';
import { buildOrderInsert, buildOrderUpdate, mapOrderToDraft, mapProductRow, type OrderCreateDraft } from './orderCreateUtils';

type FilterStatus = 'all' | OrderStatus;

function mapOrder(row: Record<string, unknown>): Order {
  return {
    id: (row.id as string) || '',
    requestedBy: ((row.requestedBy as string | undefined) ?? (row.requested_by as string | undefined)) || undefined,
    customer: (row.customer as string) || '',
    email: (row.email as string) || '',
    phone: (row.phone as string) || '',
    address: (row.address as string) || '',
    city: (row.city as string) || '',
    createdAt: (row.created_at as string) || (row.createdAt as string) || '',
    updatedAt: (row.updated_at as string) || (row.updatedAt as string) || '',
    status: (row.status as OrderStatus) || 'pending',
    total: Number(row.total || 0),
    itemCount: Number(row.item_count || row.itemCount || 0),
    vendorSplits: (row.vendor_splits as unknown as Order['vendorSplits']) || (row.vendorSplits as unknown as Order['vendorSplits']) || [],
    notes: (row.notes as string | undefined) || undefined,
  };
}

export default function OrdersPage() {
  const { formatAmount } = useCurrency();
  const { canEdit, canDelete } = useAuth();
  const showEdit = canEdit('orders');
  const showDelete = canDelete('orders');
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [search, setSearch] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ left: number; top: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    fetchOrders();
    fetchProducts();
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const handleToggleMenu = (orderId: string, event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 144;
    const menuHeight = 96;
    const left = Math.max(8, Math.min(window.innerWidth - menuWidth - 8, rect.right - menuWidth));
    const top = Math.max(8, Math.min(window.innerHeight - menuHeight - 8, rect.bottom + 8));

    if (openMenuId === orderId) {
      setOpenMenuId(null);
      setMenuPosition(null);
      return;
    }

    setOpenMenuId(orderId);
    setMenuPosition({ left, top });
  };

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error(error);
        showToast('Failed to load orders.');
      } else {
        setOrders((data || []).map(mapOrder));
      }
    } catch (err) {
      console.error(err);
      showToast('Failed to load orders.');
    } finally {
      setLoading(false);
    }
  };

  const fetchProducts = async () => {
    const { data, error } = await supabase.from('products').select('*').order('name', { ascending: true });
    if (error) console.error(error);
    else setProducts((data || []).map(mapProductRow));
  };

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      const matchStatus = filterStatus === 'all' || o.status === filterStatus;
      const matchSearch =
        o.id.toLowerCase().includes(search.toLowerCase()) ||
        o.customer.toLowerCase().includes(search.toLowerCase()) ||
        (o.requestedBy || '').toLowerCase().includes(search.toLowerCase());
      return matchStatus && matchSearch;
    });
  }, [orders, filterStatus, search]);

  const counts = useMemo(() => ({
    all: orders.length,
    pending: orders.filter((o) => o.status === 'pending').length,
    accepted: orders.filter((o) => o.status === 'accepted').length,
    partial: orders.filter((o) => o.status === 'partial').length,
    rejected: orders.filter((o) => o.status === 'rejected').length,
    processing: orders.filter((o) => o.status === 'processing').length,
    fulfilled: orders.filter((o) => o.status === 'fulfilled').length,
  }), [orders]);

  const handleUpdateOrder = async (updated: Order) => {
    try {
      const { error } = await supabase
        .from('orders')
        .update({
          status: updated.status,
          vendor_splits: updated.vendorSplits,
          updated_at: updated.updatedAt,
        })
        .eq('id', updated.id);

      if (error) {
        console.error(error);
        showToast('Failed to update order.');
      } else {
        setSelectedOrder(updated);
        await fetchOrders();
      }
    } catch (err) {
      console.error(err);
      showToast('Failed to update order.');
    }
  };

  const handleCreateOrder = async (draft: OrderCreateDraft) => {
    try {
      const payload = buildOrderInsert(draft, products);
      const { error } = await supabase.from('orders').insert(payload);

      if (error) {
        console.error(error);
        showToast('Failed to create order.');
        return;
      }

      setShowCreateModal(false);
      showToast('Order created successfully.');
      await fetchOrders();
    } catch (err) {
      console.error(err);
      showToast('Failed to create order.');
    }
  };

  const handleEditOrder = async (draft: OrderCreateDraft) => {
    if (!editingOrder) return;

    try {
      const updates = buildOrderUpdate(draft, products);
      const { error } = await supabase
        .from('orders')
        .update(updates)
        .eq('id', editingOrder.id);

      if (error) {
        console.error(error);
        showToast('Failed to save order.');
        return;
      }

      setEditingOrder(null);
      showToast('Order updated successfully.');
      await fetchOrders();
    } catch (err) {
      console.error(err);
      showToast('Failed to save order.');
    }
  };

  const handleDeleteOrder = async (order: Order) => {
    const ok = window.confirm(`Delete ${order.id}?`);
    if (!ok) return;

    try {
      const { error } = await supabase.from('orders').delete().eq('id', order.id);

      if (error) {
        console.error(error);
        showToast('Failed to delete order.');
        return;
      }

      showToast('Order deleted.');
      await fetchOrders();
    } catch (err) {
      console.error(err);
      showToast('Failed to delete order.');
    }
  };

  const publicFormUrl = `${window.location.origin}/order-form`;

  const handleCopyPublicForm = async () => {
    try {
      await navigator.clipboard.writeText(publicFormUrl);
      showToast('Order form link copied.');
    } catch {
      showToast(publicFormUrl);
    }
  };

  const totalRevenue = useMemo(() =>
    orders.filter((o) => ['accepted', 'processing', 'fulfilled'].includes(o.status)).reduce((s, o) => s + o.total, 0),
    [orders]
  );

  const filterTabs: { key: FilterStatus; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'pending', label: 'Pending' },
    { key: 'accepted', label: 'Accepted' },
    { key: 'partial', label: 'Partial' },
    { key: 'processing', label: 'Processing' },
    { key: 'fulfilled', label: 'Fulfilled' },
    { key: 'rejected', label: 'Rejected' },
  ];

  return (
    <DashboardLayout title="Orders" subtitle="Review, accept, reject and manage multi-vendor order splits.">
      {toast && (
        <div className="fixed top-5 right-5 z-[100] flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium bg-emerald-500 text-white shadow-lg">
          <i className="ri-check-line text-base"></i> {toast}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12 text-gray-400">
          <div className="w-8 h-8 flex items-center justify-center mr-3">
            <i className="ri-loader-4-line animate-spin text-xl"></i>
          </div>
          <span className="text-sm">Loading orders...</span>
        </div>
      )}

      {!loading && (
        <>
          {/* KPI Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
            {[
              { label: 'Total Orders', value: orders.length, icon: 'ri-shopping-bag-3-line', color: 'text-gray-800', bg: 'bg-gray-100' },
              { label: 'Pending Review', value: counts.pending, icon: 'ri-time-line', color: 'text-amber-700', bg: 'bg-amber-50' },
              { label: 'Accepted / Processing', value: counts.accepted + counts.processing, icon: 'ri-checkbox-circle-line', color: 'text-emerald-700', bg: 'bg-emerald-50' },
              { label: 'Revenue (Accepted)', value: formatAmount(totalRevenue), icon: 'ri-money-dollar-circle-line', color: 'text-violet-700', bg: 'bg-violet-50' },
            ].map((kpi) => (
              <div key={kpi.label} className="bg-white rounded-xl px-5 py-4 flex items-center gap-4">
                <div className={`w-10 h-10 flex items-center justify-center rounded-lg ${kpi.bg}`}>
                  <i className={`${kpi.icon} ${kpi.color} text-lg`}></i>
                </div>
                <div>
                  <p className="text-xl font-bold text-gray-900">{kpi.value}</p>
                  <p className="text-xs text-gray-400">{kpi.label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Main Panel */}
          <div className="bg-white rounded-2xl">
            {/* Toolbar */}
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-1 flex-wrap">
                {filterTabs.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setFilterStatus(tab.key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer whitespace-nowrap transition-colors ${filterStatus === tab.key ? 'bg-emerald-50 text-emerald-700' : 'text-gray-500 hover:bg-gray-50'}`}
                  >
                    {tab.label}
                    {tab.key !== 'all' && <span className="ml-1 text-gray-400">{counts[tab.key as OrderStatus]}</span>}
                    {tab.key === 'all' && <span className="ml-1 text-gray-400">{counts.all}</span>}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="relative">
                  <div className="w-4 h-4 flex items-center justify-center absolute left-3 top-1/2 -translate-y-1/2">
                    <i className="ri-search-line text-gray-400 text-sm"></i>
                  </div>
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search order ID or customer..."
                    className="pl-9 pr-4 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg w-56 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  />
                </div>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 cursor-pointer whitespace-nowrap"
                >
                  <i className="ri-add-line"></i> Create Order
                </button>
                <button
                  onClick={handleCopyPublicForm}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer whitespace-nowrap"
                >
                  <i className="ri-link"></i> Public Form
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Order ID</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Customer / Requester</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Vendors</th>
                    <th className="text-right py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Items</th>
                    <th className="text-right py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Total</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Date</th>
                    <th className="py-3 px-4"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map((order) => {
                    const vendors = [...new Set(order.vendorSplits.map((s) => s.vendor))];
                    return (
                      <tr key={order.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="py-3 px-4">
                          <span className="font-mono text-xs font-semibold text-gray-800">{order.id}</span>
                        </td>
                        <td className="py-3 px-4">
                          <div>
                            <p className="font-medium text-gray-800">{order.customer}</p>
                            <p className="text-xs text-gray-400">{order.city}</p>
                            {order.requestedBy && <p className="text-xs text-emerald-600 mt-0.5">By {order.requestedBy}</p>}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex flex-col gap-1">
                            {vendors.slice(0, 2).map((v) => (
                              <span key={v} className="text-xs text-gray-500 flex items-center gap-1">
                                <i className="ri-store-2-line text-gray-400"></i> {v}
                              </span>
                            ))}
                            {vendors.length > 2 && (
                              <span className="text-xs text-gray-400">+{vendors.length - 2} more</span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right text-gray-600 font-medium">{order.itemCount}</td>
                        <td className="py-3 px-4 text-right font-semibold text-gray-800">{formatAmount(order.total)}</td>
                        <td className="py-3 px-4">
                          <OrderStatusBadge status={order.status} />
                        </td>
                        <td className="py-3 px-4 text-xs text-gray-400 whitespace-nowrap">{order.createdAt}</td>
                        <td className="py-3 px-4">
                          <div className="relative flex items-center justify-end gap-2">
                            <button
                              onClick={() => setSelectedOrder(order)}
                              className="px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100 cursor-pointer whitespace-nowrap transition-colors"
                            >
                              {order.status === 'pending' ? 'Review' : 'View'}
                            </button>
                            {(showEdit || showDelete) && (
                              <button
                                onClick={(event) => handleToggleMenu(order.id, event)}
                                className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-400 transition-colors cursor-pointer"
                                title="More actions"
                              >
                                <i className="ri-more-2-line text-sm"></i>
                              </button>
                            )}
                            {openMenuId === order.id && menuPosition && (showEdit || showDelete) && (
                              <div
                                className="fixed w-36 bg-white border border-gray-100 rounded-xl z-[60] py-1 shadow-md"
                                style={{ left: menuPosition.left, top: menuPosition.top }}
                                onClick={(e) => e.stopPropagation()}
                                onMouseLeave={() => {
                                  setOpenMenuId(null);
                                  setMenuPosition(null);
                                }}
                              >
                                {showEdit && (
                                  <button
                                    onClick={() => {
                                      setEditingOrder(order);
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
                                      handleDeleteOrder(order);
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
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {filtered.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <div className="w-12 h-12 flex items-center justify-center mb-3">
                  <i className="ri-shopping-bag-3-line text-4xl"></i>
                </div>
                <p className="text-sm">No orders found for the selected filter.</p>
              </div>
            )}

            <div className="px-6 py-3 border-t border-gray-50 flex items-center justify-between">
              <p className="text-xs text-gray-400">Showing {filtered.length} of {orders.length} orders</p>
              <p className="text-xs text-gray-400">Last updated: 19 May 2026, 13:05</p>
            </div>
          </div>
        </>
      )}

      {selectedOrder && (
        <OrderDetailModal
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onUpdateOrder={handleUpdateOrder}
        />
      )}
      {editingOrder && (
        <OrderFormModal
          products={products}
          initialDraft={mapOrderToDraft(editingOrder)}
          title="Edit Order"
          submitLabel="Save Changes"
          onClose={() => setEditingOrder(null)}
          onSave={handleEditOrder}
        />
      )}
      {showCreateModal && (
        <OrderFormModal
          products={products}
          onClose={() => setShowCreateModal(false)}
          onSave={handleCreateOrder}
        />
      )}
    </DashboardLayout>
  );
}
