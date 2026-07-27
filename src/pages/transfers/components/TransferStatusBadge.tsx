import type { TransferStatus } from '@/mocks/transfers';

const config: Record<TransferStatus, { label: string; classes: string; icon: string }> = {
  requested: { label: 'Requested', classes: 'bg-amber-50 text-amber-700 border border-amber-200', icon: 'ri-time-line' },
  approved: { label: 'Approved', classes: 'bg-sky-50 text-sky-700 border border-sky-200', icon: 'ri-checkbox-circle-line' },
  in_transit: { label: 'In Transit', classes: 'bg-violet-50 text-violet-700 border border-violet-200', icon: 'ri-truck-line' },
  received: { label: 'Complete', classes: 'bg-emerald-50 text-emerald-700 border border-emerald-200', icon: 'ri-check-double-line' },
  cancelled: { label: 'Cancelled', classes: 'bg-gray-100 text-gray-500 border border-gray-200', icon: 'ri-close-circle-line' },
};

export default function TransferStatusBadge({ status }: { status: TransferStatus }) {
  const c = config[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${c.classes} whitespace-nowrap`}>
      <i className={c.icon}></i>
      {c.label}
    </span>
  );
}