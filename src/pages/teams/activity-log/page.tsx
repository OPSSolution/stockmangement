import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/feature/DashboardLayout';
import { supabase } from '@/lib/supabase';
import type { AuditAction, AuditFieldChange } from '@/lib/auditLog';

interface AuditLogEntry {
  id: string;
  user_id: string | null;
  user_name: string | null;
  user_role: string | null;
  action: AuditAction;
  module: string;
  description: string;
  reference_id: string | null;
  changes: AuditFieldChange[] | null;
  created_at: string;
}

function formatValue(v: string | number | boolean | null) {
  if (v === null || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return String(v);
}

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-rose-50 text-rose-600',
  staff: 'bg-sky-50 text-sky-600',
  viewer: 'bg-gray-100 text-gray-500',
};

const ACTION_META: Record<AuditAction, { icon: string; color: string; bg: string; label: string }> = {
  login: { icon: 'ri-login-circle-line', color: 'text-emerald-600', bg: 'bg-emerald-50', label: 'Signed in' },
  logout: { icon: 'ri-logout-circle-line', color: 'text-gray-500', bg: 'bg-gray-100', label: 'Signed out' },
  create: { icon: 'ri-add-circle-line', color: 'text-sky-600', bg: 'bg-sky-50', label: 'Created' },
  update: { icon: 'ri-edit-2-line', color: 'text-amber-600', bg: 'bg-amber-50', label: 'Updated' },
  delete: { icon: 'ri-delete-bin-line', color: 'text-red-600', bg: 'bg-red-50', label: 'Deleted' },
};

const ACTION_TABS: { key: 'all' | AuditAction; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'login', label: 'Logins' },
  { key: 'logout', label: 'Logouts' },
  { key: 'create', label: 'Created' },
  { key: 'update', label: 'Updated' },
  { key: 'delete', label: 'Deleted' },
];

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    time: d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
  };
}

export default function ActivityLogPage() {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState<'all' | AuditAction>('all');
  const [selected, setSelected] = useState<AuditLogEntry | null>(null);

  useEffect(() => {
    supabase
      .from('audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500)
      .then(({ data }) => {
        setEntries((data as AuditLogEntry[]) || []);
        setLoading(false);
      });
  }, []);

  const filtered = entries.filter((e) => {
    if (actionFilter !== 'all' && e.action !== actionFilter) return false;
    const q = search.toLowerCase();
    return !q || (e.user_name || '').toLowerCase().includes(q) || e.description.toLowerCase().includes(q) || e.module.toLowerCase().includes(q);
  });

  return (
    <DashboardLayout title="Activity Log" subtitle="Every login and action across the app, most recent first">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">Activity Log</h1>
          <p className="text-sm text-gray-400 mt-1">{filtered.length} of {entries.length} events</p>
        </div>
        <button
          onClick={() => navigate('/teams')}
          className="px-4 py-2 bg-white border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap cursor-pointer"
        >
          <i className="ri-arrow-left-line mr-1"></i>
          Back to Teams
        </button>
      </div>

      <div className="bg-white rounded-2xl">
        {/* Toolbar */}
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 px-6 py-4 border-b border-gray-100">
          <div className="flex flex-wrap items-center gap-1.5">
            {ACTION_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActionFilter(tab.key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg cursor-pointer transition-colors ${
                  actionFilter === tab.key ? 'bg-emerald-50 text-emerald-700' : 'text-gray-500 hover:bg-gray-50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="relative">
            <div className="w-4 h-4 flex items-center justify-center absolute left-3 top-1/2 -translate-y-1/2">
              <i className="ri-search-line text-gray-400 text-sm"></i>
            </div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, action, or module..."
              className="pl-9 pr-4 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg w-64 focus:outline-none focus:ring-2 focus:ring-emerald-200"
            />
          </div>
        </div>

        {/* List */}
        <div className="px-6 py-2">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <div className="w-10 h-10 flex items-center justify-center mb-3">
                <i className="ri-history-line text-3xl"></i>
              </div>
              <p className="text-sm">No activity recorded yet.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {filtered.map((entry) => {
                const { date, time } = formatDateTime(entry.created_at);
                const roleCls = ROLE_COLORS[entry.user_role || ''] || 'bg-gray-100 text-gray-500';
                const meta = ACTION_META[entry.action];
                return (
                  <button
                    key={entry.id}
                    onClick={() => setSelected(entry)}
                    className="w-full flex items-center justify-between gap-3 py-3 text-left hover:bg-gray-50/70 transition-colors cursor-pointer rounded-lg px-2 -mx-2"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-9 h-9 rounded-full ${meta.bg} flex items-center justify-center shrink-0`}>
                        <i className={`${meta.icon} ${meta.color} text-sm`}></i>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{entry.user_name || 'Unknown user'}</p>
                        <p className="text-xs text-gray-500 truncate">{entry.description}</p>
                        <p className={`text-xs font-medium mt-0.5 ${meta.color}`}>
                          {meta.label} · <span className="capitalize">{entry.module}</span>
                          {entry.changes && entry.changes.length > 0 && (
                            <span className="ml-1.5 text-gray-400 font-normal">· {entry.changes.length} field{entry.changes.length === 1 ? '' : 's'} changed</span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {entry.user_role && (
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${roleCls}`}>{entry.user_role}</span>
                      )}
                      <div className="text-right">
                        <p className="text-xs font-medium text-gray-700">{date}</p>
                        <p className="text-xs text-gray-400">{time}</p>
                      </div>
                      <i className="ri-arrow-right-s-line text-gray-300"></i>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Detail modal */}
      {selected && (() => {
        const meta = ACTION_META[selected.action];
        const { date, time } = formatDateTime(selected.created_at);
        const roleCls = ROLE_COLORS[selected.user_role || ''] || 'bg-gray-100 text-gray-500';
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={() => setSelected(null)}>
            <div className="bg-white rounded-2xl w-full max-w-md mx-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <div className={`w-11 h-11 rounded-xl ${meta.bg} flex items-center justify-center shrink-0`}>
                    <i className={`${meta.icon} ${meta.color} text-xl`}></i>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-gray-900">{meta.label} · <span className="capitalize">{selected.module}</span></h3>
                    <p className="text-xs text-gray-400 mt-0.5">{date} at {time}</p>
                  </div>
                </div>
                <button onClick={() => setSelected(null)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 cursor-pointer">
                  <i className="ri-close-line text-lg"></i>
                </button>
              </div>

              <div className="px-6 py-5 space-y-4">
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">What happened</p>
                  <p className="text-sm text-gray-800 leading-relaxed">{selected.description}</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-gray-50 px-4 py-3">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Performed By</p>
                    <p className="text-sm font-bold text-gray-800 mt-0.5">{selected.user_name || 'Unknown user'}</p>
                    {selected.user_role && (
                      <span className={`inline-block mt-1 text-[10px] font-medium px-2 py-0.5 rounded-full capitalize ${roleCls}`}>{selected.user_role}</span>
                    )}
                  </div>
                  <div className="rounded-xl bg-gray-50 px-4 py-3">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Module</p>
                    <p className="text-sm font-bold text-gray-800 mt-0.5 capitalize">{selected.module}</p>
                  </div>
                </div>

                {selected.changes && selected.changes.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">What changed</p>
                    <div className="rounded-xl border border-gray-100 divide-y divide-gray-50">
                      {selected.changes.map((c, i) => (
                        <div key={i} className="flex items-center justify-between gap-3 px-4 py-2.5">
                          <span className="text-xs font-medium text-gray-500 shrink-0">{c.field}</span>
                          <span className="flex items-center gap-2 text-sm min-w-0">
                            <span className="text-gray-400 line-through truncate">{formatValue(c.from)}</span>
                            <i className="ri-arrow-right-line text-gray-300 shrink-0"></i>
                            <span className="text-gray-800 font-semibold truncate">{formatValue(c.to)}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selected.reference_id && (
                  <div className="rounded-xl bg-gray-50 px-4 py-3">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Reference</p>
                    <p className="text-sm font-mono text-gray-700 mt-0.5">{selected.reference_id}</p>
                  </div>
                )}
              </div>

              <div className="px-6 py-4 border-t border-gray-100">
                <button onClick={() => setSelected(null)} className="w-full py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer whitespace-nowrap">
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </DashboardLayout>
  );
}
