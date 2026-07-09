import type { Vendor } from '@/mocks/vendors';
import { useCurrency } from '@/contexts/CurrencyContext';

interface Props {
  vendor: Vendor;
  onClose: () => void;
  onEdit?: () => void;
}

const statusConfig = {
  active: { label: 'Active', classes: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
  inactive: { label: 'Inactive', classes: 'bg-gray-100 text-gray-500 border border-gray-200' },
  suspended: { label: 'Suspended', classes: 'bg-red-50 text-red-600 border border-red-200' },
};

const typeLabel = { supplier: 'Supplier', manufacturer: 'Manufacturer', distributor: 'Distributor' };

function MetricBar({ value, max = 100, color = 'bg-emerald-500' }: { value: number; max?: number; color?: string }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="w-full bg-gray-100 rounded-full h-1.5">
      <div className={`${color} h-1.5 rounded-full transition-all`} style={{ width: `${pct}%` }}></div>
    </div>
  );
}

export default function VendorDetailModal({ vendor, onClose, onEdit }: Props) {
  const { formatAmount } = useCurrency();
  const sc = statusConfig[vendor.status];

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-lg" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center">
              <i className="ri-store-2-line text-emerald-600 text-xl"></i>
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-lg font-bold text-gray-900">{vendor.name}</h2>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${sc.classes} whitespace-nowrap`}>{sc.label}</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 whitespace-nowrap">{typeLabel[vendor.type]}</span>
              </div>
              <p className="text-sm text-gray-500 mt-0.5">{vendor.address}, {vendor.city}, {vendor.country}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 ml-4 flex-shrink-0">
            {onEdit && (
              <button onClick={onEdit} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-sky-600 bg-sky-50 rounded-lg hover:bg-sky-100 cursor-pointer whitespace-nowrap">
                <i className="ri-edit-line"></i>Edit
              </button>
            )}
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 cursor-pointer">
              <i className="ri-close-line text-gray-500"></i>
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* Performance Metrics */}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-3">Performance Metrics</p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: 'Fulfillment Rate', value: `${vendor.metrics.fulfillmentRate}%`, bar: vendor.metrics.fulfillmentRate, color: vendor.metrics.fulfillmentRate >= 90 ? 'bg-emerald-500' : vendor.metrics.fulfillmentRate >= 70 ? 'bg-amber-400' : 'bg-red-400' },
                { label: 'On-Time Delivery', value: `${vendor.metrics.onTimeDeliveryRate}%`, bar: vendor.metrics.onTimeDeliveryRate, color: vendor.metrics.onTimeDeliveryRate >= 90 ? 'bg-emerald-500' : 'bg-amber-400' },
                { label: 'Avg Delivery Days', value: `${vendor.metrics.avgDeliveryDays}d`, bar: Math.max(0, 100 - vendor.metrics.avgDeliveryDays * 10), color: 'bg-sky-400' },
                { label: 'Total Orders', value: `${vendor.metrics.totalOrders}`, bar: (vendor.metrics.fulfilledOrders / Math.max(vendor.metrics.totalOrders, 1)) * 100, color: 'bg-violet-400' },
              ].map((m) => (
                <div key={m.label} className="bg-gray-50 rounded-xl p-4">
                  <p className="text-xs text-gray-500 mb-1.5">{m.label}</p>
                  <p className="text-xl font-bold text-gray-900 mb-2">{m.value}</p>
                  <MetricBar value={m.bar} color={m.color} />
                </div>
              ))}
            </div>
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div className="bg-gray-50 rounded-lg p-3.5 text-center">
              <p className="text-xs text-gray-500 mb-1">Fulfilled Orders</p>
              <p className="text-lg font-bold text-emerald-700">{vendor.metrics.fulfilledOrders}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3.5 text-center">
              <p className="text-xs text-gray-500 mb-1">Rejected Orders</p>
              <p className="text-lg font-bold text-red-500">{vendor.metrics.rejectedOrders}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3.5 text-center">
              <p className="text-xs text-gray-500 mb-1">Total Purchase Value</p>
              <p className="text-lg font-bold text-gray-900">{formatAmount(vendor.metrics.totalPurchaseValue)}</p>
            </div>
          </div>

          {/* Contacts */}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-3">Contacts</p>
            <div className="space-y-2.5">
              {vendor.contacts.map((c, i) => (
                <div key={i} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
                      <i className="ri-user-line text-emerald-600 text-sm"></i>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{c.name}</p>
                      <p className="text-xs text-gray-500">{c.role}</p>
                    </div>
                  </div>
                  <div className="flex gap-4 text-sm text-gray-600">
                    <a href={`mailto:${c.email}`} className="flex items-center gap-1.5 hover:text-emerald-600 transition-colors cursor-pointer">
                      <i className="ri-mail-line"></i>
                      <span className="text-xs">{c.email}</span>
                    </a>
                    <a href={`tel:${c.phone}`} className="flex items-center gap-1.5 hover:text-emerald-600 transition-colors cursor-pointer">
                      <i className="ri-phone-line"></i>
                      <span className="text-xs">{c.phone}</span>
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Products */}
          {vendor.products.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-3">Assigned Products</p>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Product</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Category</th>
                      <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Stock</th>
                      <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Unit Cost</th>
                      <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {vendor.products.map((p) => {
                      const stockPct = Math.min((p.currentStock / Math.max(p.lowStockThreshold * 3, 1)) * 100, 100);
                      const stockColor = p.status === 'out_of_stock' ? 'bg-red-400' : p.status === 'low_stock' ? 'bg-amber-400' : 'bg-emerald-500';
                      const statusBadge = {
                        in_stock: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                        low_stock: 'bg-amber-50 text-amber-700 border-amber-200',
                        out_of_stock: 'bg-red-50 text-red-600 border-red-200',
                      }[p.status];
                      return (
                        <tr key={p.productId} className="hover:bg-gray-50/50">
                          <td className="px-4 py-3">
                            <p className="font-medium text-gray-800">{p.productName}</p>
                            <p className="text-xs text-gray-400 font-mono">{p.sku}</p>
                          </td>
                          <td className="px-4 py-3 text-gray-600 text-xs">{p.category}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 bg-gray-100 rounded-full h-1.5 w-20">
                                <div className={`${stockColor} h-1.5 rounded-full`} style={{ width: `${stockPct}%` }}></div>
                              </div>
                              <span className="text-xs text-gray-600 font-medium w-8 text-right">{p.currentStock}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right text-gray-600">{formatAmount(p.unitCost)}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${statusBadge} whitespace-nowrap`}>
                              {p.status.replace('_', ' ')}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Additional Info */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Company Info</p>
              <div className="flex justify-between"><span className="text-gray-500">Payment Terms</span><span className="font-medium text-gray-800">{vendor.paymentTerms}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Last Order</span><span className="text-gray-700">{vendor.metrics.lastOrderDate}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Member Since</span><span className="text-gray-700">{vendor.registeredAt}</span></div>
              {vendor.website && <div className="flex justify-between"><span className="text-gray-500">Website</span><a href={`https://${vendor.website}`} target="_blank" rel="nofollow noopener noreferrer" className="text-emerald-600 hover:underline cursor-pointer">{vendor.website}</a></div>}
            </div>
            <div>
              {vendor.tags.length > 0 && (
                <>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Tags</p>
                  <div className="flex flex-wrap gap-1.5">
                    {vendor.tags.map((tag) => (
                      <span key={tag} className="px-2.5 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-medium">{tag}</span>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {vendor.notes && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
              <i className="ri-sticky-note-line mr-2"></i>{vendor.notes}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}