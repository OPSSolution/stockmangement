import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { supabaseAdmin } from '../lib/supabaseEnv';

const router = Router();

type PagePermission = { view: boolean; edit: boolean; delete: boolean; approve: boolean };
type RoleRow = { id: string; name: string; description: string | null; permissions: Record<string, unknown>; is_system: boolean };

const PAGE_KEYS = [
  'dashboard', 'inventory', 'requests', 'orders', 'deliveries', 'warehouses', 'transfers',
  'returns', 'purchases', 'promotions', 'vendors', 'reports', 'teams',
  'requirements', 'roles', 'categories', 'request_templates',
  'notifications_history', 'notifications_analytics', 'notifications_settings',
] as const;

// Builds a full permission map from a subset of pages a role can view,
// applying the given edit/delete defaults to every page it can view.
function buildPermissions(
  viewablePages: readonly string[],
  { edit = false, del = false, approve = false }: { edit?: boolean; del?: boolean; approve?: boolean } = {}
): Record<string, PagePermission> {
  const perms: Record<string, PagePermission> = {};
  for (const key of PAGE_KEYS) {
    const view = viewablePages.includes(key);
    perms[key] = { view, edit: view && edit, delete: view && del, approve: view && approve };
  }
  return perms;
}

const DEFAULT_ROLES = [
  {
    id: 'admin',
    name: 'Admin',
    description: 'Full access to all pages',
    permissions: buildPermissions(PAGE_KEYS, { edit: true, del: true, approve: true }),
    is_system: true,
  },
  {
    id: 'staff',
    name: 'Staff',
    description: 'Access to operational pages',
    permissions: buildPermissions(
      ['dashboard', 'inventory', 'requests', 'orders', 'deliveries', 'warehouses', 'transfers',
       'returns', 'purchases', 'promotions', 'vendors', 'reports',
       'notifications_history', 'notifications_settings'],
      // approve is off by default for staff — an admin opts individual roles into
      // approving requests from the Roles editor, it isn't granted automatically.
      { edit: true, del: false, approve: false }
    ),
    is_system: true,
  },
  {
    id: 'viewer',
    name: 'Viewer',
    description: 'Read-only access to basic pages',
    permissions: buildPermissions(
      ['dashboard', 'inventory', 'orders', 'deliveries', 'warehouses', 'reports'],
      { edit: false, del: false }
    ),
    is_system: true,
  },
];

function client() {
  const supabase = supabaseAdmin();
  if (!supabase) throw new Error('Supabase admin client unavailable — check SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.');
  return supabase;
}

// Upgrades roles still storing legacy `{ page: boolean }` permissions (pre per-action
// permissions) to the `{ page: { view, edit, delete } }` shape, and backfills default
// entries for any PAGE_KEYS introduced after a role row was first seeded. Idempotent.
async function normalizeAllRolePermissions() {
  const { data: rows, error } = await client().from('roles').select('id, permissions');
  if (error) throw error;

  const defaultsById = new Map(DEFAULT_ROLES.map((r) => [r.id, r.permissions]));

  for (const row of rows || []) {
    const perms = (row.permissions || {}) as Record<string, unknown>;
    let changed = false;
    const upgraded: Record<string, PagePermission> = {};

    for (const [key, value] of Object.entries(perms)) {
      if (typeof value === 'boolean') {
        changed = true;
        upgraded[key] = {
          view: value,
          edit: value && row.id !== 'viewer',
          delete: value && row.id === 'admin',
          approve: value && row.id === 'admin',
        };
      } else if (value && typeof value === 'object') {
        const v = value as Partial<PagePermission>;
        if (v.approve === undefined) changed = true;
        upgraded[key] = { view: !!v.view, edit: !!v.edit, delete: !!v.delete, approve: !!v.approve };
      }
    }

    const missing = PAGE_KEYS.filter((key) => !(key in upgraded));
    if (missing.length > 0) {
      changed = true;
      const knownDefaults = defaultsById.get(row.id);
      for (const key of missing) {
        upgraded[key] = knownDefaults?.[key] ?? { view: false, edit: false, delete: false, approve: false };
      }
    }

    if (changed) {
      const { error: updateErr } = await client().from('roles').update({ permissions: upgraded }).eq('id', row.id);
      if (updateErr) throw updateErr;
    }
  }
}

export async function ensureRolesTable() {
  for (const role of DEFAULT_ROLES) {
    const { error } = await client().from('roles').upsert(
      { id: role.id, name: role.name, description: role.description, permissions: role.permissions, is_system: role.is_system },
      { onConflict: 'id', ignoreDuplicates: true }
    );
    if (error) throw error;
  }

  await normalizeAllRolePermissions();
}

// GET /roles — list all roles
router.get('/', async (_req, res) => {
  try {
    const { data, error } = await client().from('roles').select('*').order('created_at', { ascending: true });
    if (error) throw error;
    res.json({ data, error: null });
  } catch (err: any) {
    res.status(500).json({ data: null, error: err.message });
  }
});

// GET /roles/:id — get single role with permissions
router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await client().from('roles').select('*').eq('id', req.params.id).maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ data: null, error: 'Role not found' });
    res.json({ data, error: null });
  } catch (err: any) {
    res.status(500).json({ data: null, error: err.message });
  }
});

// POST /roles — create a new role
router.post('/', authenticate, async (req: AuthRequest, res) => {
  const { name, description, permissions } = req.body;
  if (!name?.trim()) {
    return res.status(400).json({ data: null, error: 'Name is required' });
  }

  const id = name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

  try {
    const { data, error } = await client()
      .from('roles')
      .insert({ id, name: name.trim(), description: description || null, permissions: permissions ?? {}, is_system: false })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json({ data, error: null });
  } catch (err: any) {
    const isDuplicate = err.code === '23505';
    res.status(isDuplicate ? 409 : 500).json({
      data: null,
      error: isDuplicate ? 'A role with this name already exists' : err.message,
    });
  }
});

// PATCH /roles/:id — update name, description, or permissions
router.patch('/:id', authenticate, async (req: AuthRequest, res) => {
  const { name, description, permissions } = req.body;

  try {
    const { data: existing, error: fetchErr } = await client().from('roles').select('*').eq('id', req.params.id).maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!existing) {
      return res.status(404).json({ data: null, error: 'Role not found' });
    }

    const role = existing as RoleRow;
    const updatedName        = role.is_system ? role.name        : (name?.trim()   ?? role.name);
    const updatedDescription = description !== undefined           ? description     : role.description;
    const updatedPermissions = permissions !== undefined           ? permissions     : role.permissions;

    const { data, error } = await client()
      .from('roles')
      .update({ name: updatedName, description: updatedDescription, permissions: updatedPermissions, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json({ data, error: null });
  } catch (err: any) {
    res.status(500).json({ data: null, error: err.message });
  }
});

// DELETE /roles/:id — delete a custom role (system roles are protected)
router.delete('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const { data: existing, error: fetchErr } = await client().from('roles').select('is_system').eq('id', req.params.id).maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!existing) {
      return res.status(404).json({ data: null, error: 'Role not found' });
    }
    if (existing.is_system) {
      return res.status(403).json({ data: null, error: 'System roles cannot be deleted' });
    }

    const { error } = await client().from('roles').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ data: { id: req.params.id }, error: null });
  } catch (err: any) {
    res.status(500).json({ data: null, error: err.message });
  }
});

export default router;
