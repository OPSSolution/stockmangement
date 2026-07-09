import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import DashboardLayout from '@/components/feature/DashboardLayout';

type UserRole = 'admin' | 'staff' | 'viewer';

interface TeamMember {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  phone: string | null;
  warehouse: string | null;
  created_at: string;
  last_sign_in_at: string | null;
}

interface ToastState {
  visible: boolean;
  message: string;
  type: 'success' | 'error';
}

const ROLE_COLORS: Record<UserRole, string> = {
  admin: 'bg-rose-50 text-rose-600',
  staff: 'bg-sky-50 text-sky-600',
  viewer: 'bg-gray-100 text-gray-500',
};

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  staff: 'Staff',
  viewer: 'Viewer',
};

export default function TeamsPage() {
  const { isAdmin } = useAuth();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [warehouses, setWarehouses] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    email: '',
    full_name: '',
    role: 'staff' as UserRole,
    phone: '',
    password: '',
  });
  const [inviting, setInviting] = useState(false);
  const [toast, setToast] = useState<ToastState>({ visible: false, message: '', type: 'success' });

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ visible: true, message, type });
    setTimeout(() => setToast((prev) => ({ ...prev, visible: false })), 3000);
  }, []);

  const fetchMembers = useCallback(async () => {
    setLoading(true);
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id, email, full_name, role, phone, warehouse, created_at')
      .order('created_at', { ascending: false });

    if (error || !profiles) {
      setMembers([]);
      setLoading(false);
      return;
    }

    // Try to get last_sign_in_at from auth users (requires admin, may fail — gracefully degrade)
    const mapped: TeamMember[] = profiles.map((p) => ({
      id: p.id,
      email: p.email,
      full_name: p.full_name,
      role: (p.role as UserRole) || 'viewer',
      phone: p.phone,
      warehouse: p.warehouse,
      created_at: p.created_at,
      last_sign_in_at: null,
    }));

    setMembers(mapped);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchMembers();
    supabase.from('warehouses').select('name').order('name', { ascending: true }).then(({ data }) => {
      if (data) setWarehouses(data.map((w) => w.name as string));
    });
  }, [fetchMembers]);

  const handleUpdateRole = async (memberId: string, newRole: UserRole) => {
    if (!isAdmin) {
      showToast('Admin access required', 'error');
      return;
    }
    const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', memberId);
    if (error) {
      showToast('Failed to update role: ' + error.message, 'error');
    } else {
      setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, role: newRole } : m)));
      showToast('Role updated');
    }
  };

  const handleUpdateWarehouse = async (memberId: string, newWarehouse: string) => {
    if (!isAdmin) {
      showToast('Admin access required', 'error');
      return;
    }
    const { error } = await supabase.from('profiles').update({ warehouse: newWarehouse || null }).eq('id', memberId);
    if (error) {
      showToast('Failed to update warehouse: ' + error.message, 'error');
    } else {
      setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, warehouse: newWarehouse || null } : m)));
      showToast('Warehouse updated');
    }
  };

  const handleSaveEdit = async () => {
    if (!editingMember || !isAdmin) return;
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: editingMember.full_name,
        phone: editingMember.phone,
        role: editingMember.role,
        warehouse: editingMember.warehouse,
      })
      .eq('id', editingMember.id);

    if (error) {
      showToast('Failed to save: ' + error.message, 'error');
    } else {
      setMembers((prev) =>
        prev.map((m) =>
          m.id === editingMember.id
            ? {
                ...m,
                full_name: editingMember.full_name,
                phone: editingMember.phone,
                role: editingMember.role,
                warehouse: editingMember.warehouse,
              }
            : m
        )
      );
      showToast('Member updated');
      setEditingMember(null);
    }
  };

  const handleInvite = async () => {
    if (!isAdmin) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteForm.email.trim())) {
      showToast('Enter a valid email address (e.g. name@example.com)', 'error');
      return;
    }
    setInviting(true);

    try {
      const { data, error } = await api.functions.invoke('invite-user', {
        body: {
          email: inviteForm.email,
          full_name: inviteForm.full_name,
          role: inviteForm.role,
          phone: inviteForm.phone || undefined,
          password: inviteForm.password || undefined,
        },
      });

      if (error || !data?.success) {
        showToast(error || data?.error || 'Failed to invite user', 'error');
      } else {
        showToast('User invited successfully');
        setShowInvite(false);
        setInviteForm({ email: '', full_name: '', role: 'staff', phone: '', password: '' });
        fetchMembers();
      }
    } catch (err) {
      showToast('Failed to invite: ' + (err as Error).message, 'error');
    }

    setInviting(false);
  };

  const filtered = members.filter((m) => {
    const matchesSearch =
      m.email.toLowerCase().includes(search.toLowerCase()) ||
      (m.full_name?.toLowerCase() || '').includes(search.toLowerCase()) ||
      (m.phone?.toLowerCase() || '').includes(search.toLowerCase());
    const matchesRole = roleFilter === 'all' || m.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <DashboardLayout title="Teams">
      <div className="max-w-5xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">Teams & Users</h1>
            <p className="text-sm text-gray-400 mt-1">
              {members.length} members · {members.filter((m) => m.role === 'admin').length} admins ·{' '}
              {members.filter((m) => m.role === 'staff').length} staff
            </p>
          </div>
          {isAdmin && (
            <button
              onClick={() => setShowInvite(true)}
              className="px-4 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 transition-colors whitespace-nowrap cursor-pointer flex items-center gap-2"
            >
              <i className="ri-user-add-line"></i>
              Invite Member
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 flex-1 min-w-[200px]">
            <i className="ri-search-line text-gray-400 text-sm"></i>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, email, phone..."
              className="bg-transparent text-sm text-gray-800 placeholder-gray-400 focus:outline-none w-full"
            />
          </div>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-700 focus:outline-none focus:border-emerald-400 cursor-pointer"
          >
            <option value="all">All Roles</option>
            <option value="admin">Admin</option>
            <option value="staff">Staff</option>
            <option value="viewer">Viewer</option>
          </select>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {loading ? (
            <div className="py-16 text-center">
              <i className="ri-loader-4-line animate-spin text-gray-400 text-2xl"></i>
              <p className="text-sm text-gray-400 mt-2">Loading team members...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-3">
                <i className="ri-team-line text-gray-300 text-2xl"></i>
              </div>
              <p className="text-sm text-gray-500 font-medium">No team members found</p>
              <p className="text-xs text-gray-400 mt-1">Try adjusting your search or invite a new member</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-50">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Member</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Contact</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Role</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Warehouse</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Joined</th>
                    <th className="text-right px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map((member) => (
                    <tr key={member.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                            <span className="text-sm font-semibold text-emerald-600">
                              {member.full_name?.charAt(0)?.toUpperCase() || member.email.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-gray-900">{member.full_name || 'Unnamed'}</p>
                            <p className="text-xs text-gray-400">{member.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="space-y-0.5">
                          {member.phone && (
                            <p className="text-xs text-gray-500 flex items-center gap-1">
                              <i className="ri-phone-line text-gray-300 text-xs"></i>
                              {member.phone}
                            </p>
                          )}
                          <p className="text-xs text-gray-500 flex items-center gap-1">
                            <i className="ri-mail-line text-gray-300 text-xs"></i>
                            {member.email}
                          </p>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        {isAdmin ? (
                          <select
                            value={member.role}
                            onChange={(e) => handleUpdateRole(member.id, e.target.value as UserRole)}
                            className="px-2 py-1 text-xs font-medium rounded-lg border border-gray-200 bg-white focus:outline-none focus:border-emerald-400 cursor-pointer"
                          >
                            <option value="admin">Admin</option>
                            <option value="staff">Staff</option>
                            <option value="viewer">Viewer</option>
                          </select>
                        ) : (
                          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${ROLE_COLORS[member.role]}`}>
                            {ROLE_LABELS[member.role]}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        {isAdmin ? (
                          <select
                            value={member.warehouse || ''}
                            onChange={(e) => handleUpdateWarehouse(member.id, e.target.value)}
                            className="px-2 py-1 text-xs font-medium rounded-lg border border-gray-200 bg-white focus:outline-none focus:border-emerald-400 cursor-pointer"
                          >
                            <option value="">Unassigned</option>
                            {warehouses.map((w) => <option key={w} value={w}>{w}</option>)}
                          </select>
                        ) : (
                          <span className="text-xs text-gray-500">{member.warehouse || '—'}</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-xs text-gray-500">{formatDate(member.created_at)}</p>
                      </td>
                      <td className="px-5 py-4 text-right">
                        {isAdmin && (
                          <button
                            onClick={() => setEditingMember(member)}
                            className="w-8 h-8 inline-flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
                            title="Edit"
                          >
                            <i className="ri-edit-line text-sm"></i>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Edit Member Modal */}
      {editingMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900">Edit Member</h3>
              <button
                onClick={() => setEditingMember(null)}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 cursor-pointer"
              >
                <i className="ri-close-line"></i>
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Full Name</label>
                <input
                  type="text"
                  value={editingMember.full_name || ''}
                  onChange={(e) =>
                    setEditingMember((prev) => (prev ? { ...prev, full_name: e.target.value } : null))
                  }
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="text"
                  value={editingMember.email}
                  disabled
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 text-gray-400 cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Phone Number</label>
                <input
                  type="text"
                  value={editingMember.phone || ''}
                  onChange={(e) =>
                    setEditingMember((prev) => (prev ? { ...prev, phone: e.target.value } : null))
                  }
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-400"
                  placeholder="+1 234 567 8900"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Role</label>
                <select
                  value={editingMember.role}
                  onChange={(e) =>
                    setEditingMember((prev) =>
                      prev ? { ...prev, role: e.target.value as UserRole } : null
                    )
                  }
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-400 bg-white cursor-pointer"
                >
                  <option value="admin">Admin</option>
                  <option value="staff">Staff</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Warehouse</label>
                <select
                  value={editingMember.warehouse || ''}
                  onChange={(e) =>
                    setEditingMember((prev) => (prev ? { ...prev, warehouse: e.target.value || null } : null))
                  }
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-400 bg-white cursor-pointer"
                >
                  <option value="">Unassigned</option>
                  {warehouses.map((w) => <option key={w} value={w}>{w}</option>)}
                </select>
                <p className="text-[10px] text-gray-400 mt-1">Controls which warehouse's delivery actions this member can perform.</p>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3">
              <button
                onClick={() => setEditingMember(null)}
                className="px-4 py-2 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-5 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 transition-colors cursor-pointer"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900">Invite Team Member</h3>
              <button
                onClick={() => setShowInvite(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 cursor-pointer"
              >
                <i className="ri-close-line"></i>
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Email *</label>
                <input
                  type="email"
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm((f) => ({ ...f, email: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-400"
                  placeholder="colleague@company.com"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Full Name *</label>
                <input
                  type="text"
                  value={inviteForm.full_name}
                  onChange={(e) => setInviteForm((f) => ({ ...f, full_name: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-400"
                  placeholder="Jane Doe"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Role</label>
                  <select
                    value={inviteForm.role}
                    onChange={(e) => setInviteForm((f) => ({ ...f, role: e.target.value as UserRole }))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-400 bg-white cursor-pointer"
                  >
                    <option value="staff">Staff</option>
                    <option value="admin">Admin</option>
                    <option value="viewer">Viewer</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Phone</label>
                  <input
                    type="text"
                    value={inviteForm.phone}
                    onChange={(e) => setInviteForm((f) => ({ ...f, phone: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-400"
                    placeholder="+1 234 567 8900"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Password (optional)</label>
                <input
                  type="text"
                  value={inviteForm.password}
                  onChange={(e) => setInviteForm((f) => ({ ...f, password: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-400"
                  placeholder="Leave blank to auto-generate"
                />
                <p className="text-[10px] text-gray-400 mt-1">
                  If left blank, a random secure password will be generated. You'll need to share it with the new user.
                </p>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowInvite(false)}
                className="px-4 py-2 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleInvite}
                disabled={!inviteForm.email || !inviteForm.full_name || inviting}
                className="px-5 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center gap-2"
              >
                {inviting ? (
                  <>
                    <i className="ri-loader-4-line animate-spin"></i>
                    Inviting...
                  </>
                ) : (
                  <>
                    <i className="ri-user-add-line"></i>
                    Invite Member
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast.visible && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium transition-all ${
            toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-500 text-white'
          }`}
        >
          <div className="flex items-center gap-2">
            <i
              className={`${toast.type === 'success' ? 'ri-check-line' : 'ri-error-warning-line'} text-base`}
            ></i>
            {toast.message}
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}