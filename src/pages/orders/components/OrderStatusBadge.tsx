import { OrderStatus } from '@/mocks/orders';

const config: Record<OrderStatus, { label: string; cls: string }> = {
  pending: { label: 'Pending', cls: 'bg-amber-50 text-amber-700' },
  accepted: { label: 'Approved', cls: 'bg-emerald-50 text-emerald-700' },
  rejected: { label: 'Rejected', cls: 'bg-red-50 text-red-600' },
  partial: { label: 'Partial', cls: 'bg-sky-50 text-sky-700' },
  processing: { label: 'Complete', cls: 'bg-violet-50 text-violet-700' },
  fulfilled: { label: 'Fulfilled', cls: 'bg-emerald-50 text-emerald-600' },
};

export default function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const { label, cls } = config[status] ?? config.pending;
  return (
    <span className={`text-xs font-medium px-2 py-1 rounded-full whitespace-nowrap ${cls}`}>{label}</span>
  );
}