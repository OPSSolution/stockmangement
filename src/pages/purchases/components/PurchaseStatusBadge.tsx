import type { PurchaseStatus } from '@/mocks/purchases';

const config: Record<PurchaseStatus, { label: string; classes: string; icon: string }> = {
  pending: { label: 'Pending Approval', classes: 'bg-amber-50 text-amber-700 border border-amber-200', icon: 'ri-time-line' },
  approved: { label: 'Approved', classes: 'bg-sky-50 text-sky-700 border border-sky-200', icon: 'ri-checkbox-circle-line' },
  rejected: { label: 'Rejected', classes: 'bg-red-50 text-red-600 border border-red-200', icon: 'ri-close-circle-line' },
  ordered: { label: 'Ordered', classes: 'bg-violet-50 text-violet-700 border border-violet-200', icon: 'ri-shopping-cart-2-line' },
  received: { label: 'Complete', classes: 'bg-emerald-50 text-emerald-700 border border-emerald-200', icon: 'ri-check-double-line' },
  cancelled: { label: 'Cancelled', classes: 'bg-gray-100 text-gray-500 border border-gray-200', icon: 'ri-forbid-line' },
};

export default function PurchaseStatusBadge({ status }: { status: PurchaseStatus }) {
  const c = config[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${c.classes} whitespace-nowrap`}>
      <i className={c.icon}></i>
      {c.label}
    </span>
  );
}