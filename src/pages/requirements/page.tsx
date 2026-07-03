import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import DashboardLayout from '@/components/feature/DashboardLayout';

interface Requirement {
  id: string;
  title: string;
  description: string | null;
  module: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  status: 'pending' | 'in_progress' | 'completed' | 'deferred';
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

const MODULES = ['Dashboard', 'Inventory', 'Orders', 'Deliveries', 'Transfers', 'Returns', 'Purchases', 'Vendors', 'Warehouses', 'Promotions', 'Reports', 'Notifications', 'Auth', 'Mobile UX'] as const;
const PRIORITIES = [
  { value: 'critical', label: 'Critical', color: 'bg-red-50 text-red-600' },
  { value: 'high', label: 'High', color: 'bg-amber-50 text-amber-600' },
  { value: 'medium', label: 'Medium', color: 'bg-sky-50 text-sky-600' },
  { value: 'low', label: 'Low', color: 'bg-gray-50 text-gray-500' },
] as const;
const STATUSES = [
  { value: 'pending', label: 'Pending', color: 'bg-gray-50 text-gray-500' },
  { value: 'in_progress', label: 'In Progress', color: 'bg-blue-50 text-blue-600' },
  { value: 'completed', label: 'Completed', color: 'bg-emerald-50 text-emerald-600' },
  { value: 'deferred', label: 'Deferred', color: 'bg-purple-50 text-purple-600' },
] as const;

interface ToastState {
  visible: boolean;
  message: string;
  type: 'success' | 'error';
}

export default function RequirementsPage() {
  const { isAdmin, canEdit, canDelete } = useAuth();
  const showEdit = canEdit('requirements');
  const showDelete = canDelete('requirements');
  const navigate = useNavigate();

  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterModule, setFilterModule] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editingReq, setEditingReq] = useState<Requirement | null>(null);
  const [form, setForm] = useState({
    title: '',
    description: '',
    module: 'Dashboard',
    priority: 'medium' as Requirement['priority'],
    status: 'pending' as Requirement['status'],
  });

  const [toast, setToast] = useState<ToastState>({ visible: false, message: '', type: 'success' });

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ visible: true, message, type });
    setTimeout(() => setToast((prev) => ({ ...prev, visible: false })), 3000);
  }, []);

  const loadRequirements = useCallback(async () => {
    setLoading(true);
    let q = supabase.from('requirements').select('*').order('created_at', { ascending: false });
    if (filterModule) q = q.eq('module', filterModule);
    if (filterPriority) q = q.eq('priority', filterPriority);
    if (filterStatus) q = q.eq('status', filterStatus);
    const { data, error } = await q;
    if (!error && data) {
      setRequirements(data as Requirement[]);
    }
    setLoading(false);
  }, [filterModule, filterPriority, filterStatus]);

  useEffect(() => {
    loadRequirements();
  }, [loadRequirements]);

  const openNew = () => {
    setEditingReq(null);
    setForm({ title: '', description: '', module: 'Dashboard', priority: 'medium', status: 'pending' });
    setShowForm(true);
  };

  const openEdit = (req: Requirement) => {
    setEditingReq(req);
    setForm({
      title: req.title,
      description: req.description || '',
      module: req.module,
      priority: req.priority,
      status: req.status,
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) {
      showToast('Title is required', 'error');
      return;
    }

    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      module: form.module,
      priority: form.priority,
      status: form.status,
      updated_at: new Date().toISOString(),
    };

    let error;
    if (editingReq) {
      const { error: e } = await supabase.from('requirements').update(payload).eq('id', editingReq.id);
      error = e;
    } else {
      const { error: e } = await supabase.from('requirements').insert(payload);
      error = e;
    }

    if (error) {
      showToast('Failed to save: ' + error.message, 'error');
    } else {
      showToast(editingReq ? 'Requirement updated' : 'Requirement created');
      setShowForm(false);
      setEditingReq(null);
      await loadRequirements();
    }
  };

  const handleStatusChange = async (req: Requirement, newStatus: Requirement['status']) => {
    const { error } = await supabase
      .from('requirements')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', req.id);

    if (error) {
      showToast('Failed to update status', 'error');
    } else {
      setRequirements((prev) =>
        prev.map((r) => (r.id === req.id ? { ...r, status: newStatus, updated_at: new Date().toISOString() } : r))
      );
      showToast('Status updated');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this requirement?')) return;
    const { error } = await supabase.from('requirements').delete().eq('id', id);
    if (error) {
      showToast('Failed to delete', 'error');
    } else {
      setRequirements((prev) => prev.filter((r) => r.id !== id));
      showToast('Requirement deleted');
    }
  };

  const filteredCount = requirements.length;
  const stats = {
    total: requirements.length,
    pending: requirements.filter((r) => r.status === 'pending').length,
    inProgress: requirements.filter((r) => r.status === 'in_progress').length,
    completed: requirements.filter((r) => r.status === 'completed').length,
    critical: requirements.filter((r) => r.priority === 'critical').length,
  };

  const clearFilters = () => {
    setFilterModule('');
    setFilterPriority('');
    setFilterStatus('');
  };

  if (!isAdmin) {
    return (
      <DashboardLayout title="Requirements" subtitle="System requirements tracking">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <i className="ri-lock-line text-gray-300 text-2xl"></i>
            </div>
            <h2 className="text-lg font-bold text-gray-900 mb-2">Admin Access Required</h2>
            <p className="text-sm text-gray-400 mb-6">Only admins can manage system requirements.</p>
            <button
              onClick={() => navigate('/')}
              className="px-5 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors cursor-pointer whitespace-nowrap"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Requirements" subtitle="System requirements tracking">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Requirements</h1>
            <p className="text-sm text-gray-400 mt-1">Track and manage system feature requirements</p>
          </div>
          <button
            onClick={openNew}
            className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors whitespace-nowrap cursor-pointer"
          >
            <i className="ri-add-line mr-1"></i>
            New Requirement
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: 'Total', value: stats.total, color: 'text-gray-900', bg: 'bg-white' },
            { label: 'Pending', value: stats.pending, color: 'text-gray-600', bg: 'bg-white' },
            { label: 'In Progress', value: stats.inProgress, color: 'text-blue-600', bg: 'bg-blue-50' },
            { label: 'Completed', value: stats.completed, color: 'text-emerald-600', bg: 'bg-emerald-50' },
            { label: 'Critical', value: stats.critical, color: 'text-red-600', bg: 'bg-red-50' },
          ].map((s) => (
            <div key={s.label} className={`${s.bg} rounded-xl border border-gray-100 px-4 py-3`}>
              <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-gray-400">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl border border-gray-100 px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-medium text-gray-500">Filters:</span>
            <select
              value={filterModule}
              onChange={(e) => setFilterModule(e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-400 bg-white"
            >
              <option value="">All Modules</option>
              {MODULES.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <select
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-400 bg-white"
            >
              <option value="">All Priorities</option>
              {PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-400 bg-white"
            >
              <option value="">All Statuses</option>
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            {(filterModule || filterPriority || filterStatus) && (
              <button
                onClick={clearFilters}
                className="text-xs text-gray-400 hover:text-gray-600 underline cursor-pointer"
              >
                Clear
              </button>
            )}
            <span className="text-xs text-gray-400 ml-auto">{filteredCount} items</span>
          </div>
        </div>

        {/* Create/Edit Form */}
        {showForm && (
          <div className="bg-white rounded-xl border border-gray-100 px-6 py-5">
            <h3 className="text-sm font-bold text-gray-900 mb-4">
              {editingReq ? 'Edit Requirement' : 'New Requirement'}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Title</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-400"
                  placeholder="Feature or requirement title"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Module</label>
                <select
                  value={form.module}
                  onChange={(e) => setForm((f) => ({ ...f, module: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-400 bg-white"
                >
                  {MODULES.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-400 resize-none"
                rows={3}
                placeholder="Describe the requirement in detail..."
                maxLength={500}
              />
              <p className="text-[10px] text-gray-400 mt-1 text-right">{form.description.length}/500</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Priority</label>
                <div className="flex flex-wrap gap-2">
                  {PRIORITIES.map((p) => (
                    <button
                      key={p.value}
                      onClick={() => setForm((f) => ({ ...f, priority: p.value as Requirement['priority'] }))}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                        form.priority === p.value
                          ? `${p.color} border-current`
                          : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
                <div className="flex flex-wrap gap-2">
                  {STATUSES.map((s) => (
                    <button
                      key={s.value}
                      onClick={() => setForm((f) => ({ ...f, status: s.value as Requirement['status'] }))}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                        form.status === s.value
                          ? `${s.color} border-current`
                          : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleSave}
                className="px-5 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 transition-colors whitespace-nowrap cursor-pointer"
              >
                {editingReq ? 'Update' : 'Create'}
              </button>
              <button
                onClick={() => { setShowForm(false); setEditingReq(null); }}
                className="px-5 py-2 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          {loading ? (
            <div className="py-12 text-center">
              <i className="ri-loader-4-line animate-spin text-gray-400 text-xl"></i>
            </div>
          ) : requirements.length === 0 ? (
            <div className="py-12 text-center">
              <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-3">
                <i className="ri-clipboard-line text-gray-300 text-xl"></i>
              </div>
              <p className="text-sm text-gray-400">No requirements found</p>
              <p className="text-xs text-gray-300 mt-1">
                {filterModule || filterPriority || filterStatus
                  ? 'Try clearing your filters'
                  : 'Create your first requirement to start tracking'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="px-6 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Requirement</th>
                    <th className="px-6 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Module</th>
                    <th className="px-6 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Priority</th>
                    <th className="px-6 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Updated</th>
                    <th className="px-6 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {requirements.map((req) => {
                    const priorityMeta = PRIORITIES.find((p) => p.value === req.priority) || PRIORITIES[2];
                    const statusMeta = STATUSES.find((s) => s.value === req.status) || STATUSES[0];
                    return (
                      <tr key={req.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <p className="text-sm font-semibold text-gray-800">{req.title}</p>
                          {req.description && (
                            <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{req.description}</p>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-xs font-medium text-gray-500 bg-gray-50 px-2 py-1 rounded">
                            {req.module}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${priorityMeta.color}`}>
                            {priorityMeta.label}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <select
                            value={req.status}
                            onChange={(e) => handleStatusChange(req, e.target.value as Requirement['status'])}
                            className={`text-xs font-medium px-2 py-1 rounded-lg border focus:outline-none cursor-pointer ${statusMeta.color} border-transparent hover:border-current bg-transparent`}
                          >
                            {STATUSES.map((s) => (
                              <option key={s.value} value={s.value}>{s.label}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-xs text-gray-400">
                            {new Date(req.updated_at).toLocaleDateString()}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {showEdit && (
                              <button
                                onClick={() => openEdit(req)}
                                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
                                title="Edit"
                              >
                                <i className="ri-edit-line text-sm"></i>
                              </button>
                            )}
                            {showDelete && (
                              <button
                                onClick={() => handleDelete(req.id)}
                                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors cursor-pointer"
                                title="Delete"
                              >
                                <i className="ri-delete-bin-line text-sm"></i>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast.visible && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium transition-all ${
            toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-500 text-white'
          }`}
        >
          <div className="flex items-center gap-2">
            <i
              className={`${
                toast.type === 'success' ? 'ri-check-line' : 'ri-error-warning-line'
              } text-base`}
            ></i>
            {toast.message}
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}