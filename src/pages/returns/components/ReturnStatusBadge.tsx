import type { ReturnStatus } from '@/mocks/returns';

const config: Record<ReturnStatus, { label: string; classes: string; icon: string }> = {
  pending: { label: 'Pending', classes: 'bg-amber-50 text-amber-700 border border-amber-200', icon: 'ri-time-line' },
  inspecting: { label: 'Inspecting', classes: 'bg-sky-50 text-sky-700 border border-sky-200', icon: 'ri-search-eye-line' },
  approved: { label: 'Approved', classes: 'bg-violet-50 text-violet-700 border border-violet-200', icon: 'ri-checkbox-circle-line' },
  restocked: { label: 'Restocked', classes: 'bg-emerald-50 text-emerald-700 border border-emerald-200', icon: 'ri-archive-stack-line' },
  discarded: { label: 'Discarded', classes: 'bg-red-50 text-red-600 border border-red-200', icon: 'ri-delete-bin-line' },
};

export default function ReturnStatusBadge({ status }: { status: ReturnStatus }) {
  const c = config[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${c.classes} whitespace-nowrap`}>
      <i className={c.icon}></i>
      {c.label}
    </span>
  );
}