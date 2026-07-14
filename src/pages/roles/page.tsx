import { useState, useEffect } from 'react';
import DashboardLayout from '@/components/feature/DashboardLayout';
import { useAuth, normalizePerm, type PagePermission } from '@/contexts/AuthContext';
import { exportToCsv } from '@/lib/exportCsv';
import { logAudit } from '@/lib/auditLog';

function getToken() {
  return localStorage.getItem('sm_access_token');
}

async function rolesApi(path: string, method = 'GET', body?: unknown) {
  const res = await fetch(`/api/roles${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return res.json();
}

type PageAction = 'edit' | 'delete' | 'approve';

interface PageDef {
  key: string;
  label: string;
  icon: string;
  /** Which extra actions this page actually has UI for, beyond view. */
  actions: PageAction[];
}

const PAGE_GROUPS: { group: string; pages: PageDef[] }[] = [
  {
    group: 'Main Menu',
    pages: [
      { key: 'dashboard',  label: 'Dashboard',  icon: 'ri-dashboard-3-line',     actions: [] },
      { key: 'inventory',  label: 'Inventory',  icon: 'ri-archive-stack-line',   actions: ['edit', 'delete'] },
      { key: 'inventory_stock_adjust', label: 'Stock Adjust', icon: 'ri-equalizer-line', actions: [] },
      { key: 'categories', label: 'Categories', icon: 'ri-price-tag-2-line',     actions: ['edit', 'delete'] },
      { key: 'requests',   label: 'Requests',   icon: 'ri-file-list-3-line',     actions: ['edit', 'delete', 'approve'] },
      { key: 'orders',     label: 'Orders',     icon: 'ri-shopping-bag-3-line',  actions: ['edit', 'delete', 'approve'] },
      { key: 'deliveries', label: 'Deliveries', icon: 'ri-truck-line',           actions: ['edit', 'delete'] },
      { key: 'warehouses', label: 'Warehouses', icon: 'ri-building-2-line',      actions: ['edit', 'delete'] },
      { key: 'transfers',  label: 'Transfers',  icon: 'ri-swap-box-line',        actions: [] },
      { key: 'returns',    label: 'Returns',    icon: 'ri-arrow-go-back-line',   actions: ['edit', 'delete'] },
      { key: 'purchases',  label: 'Purchases',  icon: 'ri-shopping-cart-2-line', actions: [] },
      { key: 'promotions', label: 'Promotions', icon: 'ri-price-tag-3-line',     actions: [] },
      { key: 'vendors',    label: 'Vendors',    icon: 'ri-store-2-line',         actions: ['edit', 'delete'] },
    ],
  },
  {
    group: 'Management',
    pages: [
      { key: 'reports',      label: 'Reports',      icon: 'ri-bar-chart-2-line', actions: [] },
      { key: 'teams',        label: 'Teams',        icon: 'ri-team-line',        actions: ['edit'] },
      { key: 'requirements', label: 'Requirements', icon: 'ri-list-check-2',     actions: ['edit', 'delete'] },
      { key: 'roles',        label: 'Roles',        icon: 'ri-shield-user-line', actions: ['edit', 'delete'] },
    ],
  },
  {
    group: 'Notifications',
    pages: [
      { key: 'notifications_history',   label: 'History',   icon: 'ri-history-line',       actions: ['delete'] },
      { key: 'notifications_analytics', label: 'Analytics', icon: 'ri-bar-chart-box-line', actions: [] },
      { key: 'notifications_settings',  label: 'Settings',  icon: 'ri-notification-3-line', actions: ['edit', 'delete'] },
    ],
  },
  {
    group: 'Admin',
    pages: [
      { key: 'request_templates', label: 'Request Templates', icon: 'ri-file-list-2-line', actions: ['edit', 'delete'] },
    ],
  },
];

const ALL_PAGES = PAGE_GROUPS.flatMap(g => g.pages);

type Permissions = Record<string, PagePermission>;

interface Role {
  id: string;
  name: string;
  description: string | null;
  permissions: Record<string, boolean | Partial<PagePermission>>;
  is_system: boolean;
  created_at: string;
}

const defaultPermissions = (): Permissions => {
  const perms: Permissions = {};
  ALL_PAGES.forEach(p => { perms[p.key] = { view: false, edit: false, delete: false, approve: false }; });
  return perms;
};

const normalizeAll = (perms: Record<string, boolean | Partial<PagePermission>>): Permissions => {
  const out: Permissions = {};
  ALL_PAGES.forEach(p => { out[p.key] = normalizePerm(perms[p.key]); });
  return out;
};

const TOTAL_PAGES = ALL_PAGES.length;

export default function RolesPage() {
  const { canEdit, canDelete } = useAuth();
  const showEdit = canEdit('roles');
  const showDelete = canDelete('roles');
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editRole, setEditRole] = useState<Role | null>(null);
  const [form, setForm] = useState({ name: '', description: '', permissions: defaultPermissions() });
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const loadRoles = async () => {
    setLoading(true);
    const { data } = await rolesApi('/');
    setRoles((data as Role[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { loadRoles(); }, []);

  const openCreate = () => {
    setEditRole(null);
    setForm({ name: '', description: '', permissions: defaultPermissions() });
    setModalOpen(true);
  };

  const openEdit = (role: Role) => {
    setEditRole(role);
    setForm({
      name: role.name,
      description: role.description ?? '',
      permissions: normalizeAll(role.permissions),
    });
    setModalOpen(true);
  };

  // Toggling view off also clears edit/delete/approve for that page; toggling it on doesn't grant anything else.
  const toggleView = (key: string) =>
    setForm(f => {
      const current = f.permissions[key];
      const nextView = !current.view;
      return {
        ...f,
        permissions: {
          ...f.permissions,
          [key]: nextView ? { ...current, view: true } : { view: false, edit: false, delete: false, approve: false },
        },
      };
    });

  // Turning on an edit/delete action implies view access.
  const toggleAction = (key: string, action: PageAction) =>
    setForm(f => {
      const current = f.permissions[key];
      return {
        ...f,
        permissions: {
          ...f.permissions,
          [key]: { ...current, view: true, [action]: !current[action] },
        },
      };
    });

  const toggleGroup = (group: { pages: PageDef[] }) => {
    const allOn = group.pages.every(p => form.permissions[p.key].view);
    setForm(f => {
      const perms = { ...f.permissions };
      group.pages.forEach(p => {
        perms[p.key] = allOn ? { view: false, edit: false, delete: false, approve: false } : { view: true, edit: false, delete: false, approve: false };
      });
      return { ...f, permissions: perms };
    });
  };

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    if (editRole) {
      await rolesApi(`/${editRole.id}`, 'PATCH', {
        name: form.name,
        description: form.description || null,
        permissions: form.permissions,
      });
      logAudit({ action: 'update', module: 'roles', description: `Updated role "${form.name}"`, referenceId: editRole.id });
    } else {
      await rolesApi('/', 'POST', {
        name: form.name,
        description: form.description || null,
        permissions: form.permissions,
      });
      logAudit({ action: 'create', module: 'roles', description: `Created role "${form.name}"` });
    }
    setSaving(false);
    setModalOpen(false);
    loadRoles();
  };

  const confirmDelete = async (id: string) => {
    const roleName = roles.find((r) => r.id === id)?.name || id;
    await rolesApi(`/${id}`, 'DELETE');
    setDeleteConfirm(null);
    loadRoles();
    logAudit({ action: 'delete', module: 'roles', description: `Deleted role "${roleName}"`, referenceId: id });
  };

  const permCount = (perms: Record<string, boolean | Partial<PagePermission>>) =>
    ALL_PAGES.filter(p => normalizePerm(perms[p.key]).view).length;

  return (
    <DashboardLayout title="Roles" subtitle="Manage roles and page access permissions">
      <div className="p-6 max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Roles</h1>
            <p className="text-sm text-gray-500 mt-0.5">Control which pages each role can view, edit, and delete</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => exportToCsv('roles', roles, [
                { header: 'ID', value: (r) => r.id },
                { header: 'Name', value: (r) => r.name },
                { header: 'Description', value: (r) => r.description || '' },
                { header: 'System Role', value: (r) => r.is_system ? 'Yes' : 'No' },
                { header: 'Pages Granted', value: (r) => permCount(r.permissions) },
                {
                  header: 'Permissions',
                  value: (r) => ALL_PAGES
                    .filter((p) => normalizePerm(r.permissions[p.key]).view)
                    .map((p) => {
                      const perm = normalizePerm(r.permissions[p.key]);
                      const flags = [perm.edit && 'edit', perm.delete && 'delete', perm.approve && 'approve'].filter(Boolean).join('+');
                      return flags ? `${p.label} (${flags})` : p.label;
                    })
                    .join('; '),
                },
                { header: 'Created At', value: (r) => r.created_at },
              ])}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors cursor-pointer"
            >
              <i className="ri-download-2-line"></i> Export
            </button>
            <button
              onClick={openCreate}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors cursor-pointer"
            >
              <i className="ri-add-line"></i> Create Role
            </button>
          </div>
        </div>

        {/* Roles list */}
        {loading ? (
          <div className="flex items-center justify-center py-20 text-gray-400">
            <i className="ri-loader-4-line animate-spin text-xl mr-2"></i> Loading...
          </div>
        ) : roles.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <i className="ri-shield-user-line text-4xl mb-2 block"></i>
            <p className="text-sm">No roles yet. Run the SQL migration first, then create roles.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {roles.map(role => (
              <div key={role.id} className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                      <i className="ri-shield-user-line text-emerald-600"></i>
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 leading-tight">{role.name}</h3>
                      {role.is_system && (
                        <span className="text-xs text-gray-400">System role</span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    {showEdit && (
                      <button
                        onClick={() => openEdit(role)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors cursor-pointer"
                        title="Edit"
                      >
                        <i className="ri-edit-line text-sm"></i>
                      </button>
                    )}
                    {showDelete && !role.is_system && (
                      <button
                        onClick={() => setDeleteConfirm(role.id)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors cursor-pointer"
                        title="Delete"
                      >
                        <i className="ri-delete-bin-line text-sm"></i>
                      </button>
                    )}
                  </div>
                </div>

                {role.description && (
                  <p className="text-sm text-gray-500 mb-3 leading-snug">{role.description}</p>
                )}

                {/* Permission bar */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                      <div
                        className="bg-emerald-500 h-1.5 rounded-full transition-all"
                        style={{ width: `${(permCount(role.permissions) / TOTAL_PAGES) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-400 whitespace-nowrap">
                      {permCount(role.permissions)}/{TOTAL_PAGES} pages
                    </span>
                  </div>
                  {/* Page chips */}
                  <div className="flex flex-wrap gap-1 pt-1">
                    {ALL_PAGES
                      .filter(p => normalizePerm(role.permissions[p.key]).view)
                      .slice(0, 6)
                      .map(p => {
                        const perm = normalizePerm(role.permissions[p.key]);
                        return (
                          <span key={p.key} className="text-xs px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded flex items-center gap-1">
                            {p.label}
                            {perm.edit && <i className="ri-edit-line text-[10px]" title="Can edit"></i>}
                            {perm.delete && <i className="ri-delete-bin-line text-[10px]" title="Can delete"></i>}
                          </span>
                        );
                      })}
                    {permCount(role.permissions) > 6 && (
                      <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">
                        +{permCount(role.permissions) - 6} more
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
              <h2 className="text-lg font-semibold text-gray-900">
                {editRole ? 'Edit Role' : 'Create Role'}
              </h2>
              <button
                onClick={() => setModalOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 cursor-pointer"
              >
                <i className="ri-close-line text-lg"></i>
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  disabled={editRole?.is_system}
                  placeholder="e.g. Manager"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-gray-50 disabled:text-gray-400"
                />
                {editRole?.is_system && (
                  <p className="text-xs text-gray-400 mt-1">System role names cannot be changed.</p>
                )}
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Brief description of this role"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Page permissions */}
              <div>
                <p className="text-sm font-medium text-gray-700 mb-1">Page Access</p>
                <p className="text-xs text-gray-400 mb-3">Toggle a page on to grant view access. Edit / Delete only apply to pages that support them, and require view to be on.</p>
                <div className="space-y-3">
                  {PAGE_GROUPS.map(group => {
                    const allOn = group.pages.every(p => form.permissions[p.key].view);
                    const someOn = group.pages.some(p => form.permissions[p.key].view);
                    return (
                      <div key={group.group} className="border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
                        {/* Group header */}
                        <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                            {group.group}
                          </span>
                          <button
                            onClick={() => toggleGroup(group)}
                            className={`text-xs font-medium px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                              allOn
                                ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                                : someOn
                                ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                            }`}
                          >
                            {allOn ? 'Deselect all' : 'Select all'}
                          </button>
                        </div>

                        {/* Page rows */}
                        <div className="divide-y divide-gray-100">
                          {group.pages.map(page => {
                            const perm = form.permissions[page.key];
                            return (
                              <div
                                key={page.key}
                                className="flex items-center justify-between gap-3 px-4 py-2.5 bg-white hover:bg-gray-50 transition-colors"
                              >
                                {/* View toggle */}
                                <div
                                  onClick={() => toggleView(page.key)}
                                  className="flex items-center gap-3 cursor-pointer select-none min-w-0 flex-1"
                                >
                                  <div className={`w-9 h-5 rounded-full transition-colors flex-shrink-0 relative ${perm.view ? 'bg-emerald-500' : 'bg-gray-200'}`}>
                                    <div className={`w-3.5 h-3.5 bg-white rounded-full absolute top-0.5 shadow-sm transition-transform ${perm.view ? 'translate-x-4' : 'translate-x-0.5'}`} />
                                  </div>
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <i className={`${page.icon} text-sm flex-shrink-0 ${perm.view ? 'text-emerald-600' : 'text-gray-400'}`}></i>
                                    <span className={`text-sm truncate ${perm.view ? 'text-gray-800' : 'text-gray-400'}`}>
                                      {page.label}
                                    </span>
                                  </div>
                                </div>

                                {/* Edit / Delete action pills */}
                                {page.actions.length > 0 && (
                                  <div className="flex items-center gap-1.5 flex-shrink-0">
                                    {page.actions.includes('edit') && (
                                      <button
                                        type="button"
                                        onClick={() => toggleAction(page.key, 'edit')}
                                        disabled={!perm.view}
                                        className={`text-xs font-medium px-2 py-1 rounded-md transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                                          perm.edit ? 'bg-sky-100 text-sky-700 hover:bg-sky-200' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                                        }`}
                                      >
                                        <i className="ri-edit-line mr-1"></i>Edit
                                      </button>
                                    )}
                                    {page.actions.includes('delete') && (
                                      <button
                                        type="button"
                                        onClick={() => toggleAction(page.key, 'delete')}
                                        disabled={!perm.view}
                                        className={`text-xs font-medium px-2 py-1 rounded-md transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                                          perm.delete ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                                        }`}
                                      >
                                        <i className="ri-delete-bin-line mr-1"></i>Delete
                                      </button>
                                    )}
                                    {page.actions.includes('approve') && (
                                      <button
                                        type="button"
                                        onClick={() => toggleAction(page.key, 'approve')}
                                        disabled={!perm.view}
                                        title={`Allow this role to approve/reject pending ${page.label.toLowerCase()}`}
                                        className={`text-xs font-medium px-2 py-1 rounded-md transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                                          perm.approve ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                                        }`}
                                      >
                                        <i className="ri-checkbox-circle-line mr-1"></i>Approve
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 flex-shrink-0">
              <span className="text-sm text-gray-400">
                {ALL_PAGES.filter(p => form.permissions[p.key].view).length}/{TOTAL_PAGES} pages selected
              </span>
              <div className="flex gap-3">
                <button
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={save}
                  disabled={saving || !form.name.trim()}
                  className="px-5 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {saving ? 'Saving...' : editRole ? 'Save Changes' : 'Create Role'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <i className="ri-delete-bin-line text-red-600"></i>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Delete Role</h3>
                <p className="text-sm text-gray-500">This action cannot be undone.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => confirmDelete(deleteConfirm)}
                className="flex-1 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
