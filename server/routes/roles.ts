import { Router } from 'express';
import { pool } from '../db';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

type PagePermission = { view: boolean; edit: boolean; delete: boolean; approve: boolean };

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

// Upgrades roles still storing legacy `{ page: boolean }` permissions (pre per-action
// permissions) to the `{ page: { view, edit, delete } }` shape. Idempotent — once a
// role's permissions are all objects, this is a no-op for it.
async function migrateLegacyPermissions() {
  const { rows } = await pool.query('SELECT id, permissions FROM roles');
  for (const row of rows) {
    const perms = row.permissions as Record<string, unknown>;
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

    if (changed) {
      await pool.query('UPDATE roles SET permissions = $1 WHERE id = $2', [JSON.stringify(upgraded), row.id]);
    }
  }
}

// Adds default permission entries for any PAGE_KEYS introduced after a role
// row was first seeded (e.g. 'requests') — INSERT ... ON CONFLICT DO NOTHING
// never touches pre-existing rows, so without this they'd be missing the key
// entirely and canAccess() would treat that as "no access".
async function backfillMissingPageKeys() {
  const defaultsById = new Map(DEFAULT_ROLES.map((r) => [r.id, r.permissions]));

  const { rows } = await pool.query('SELECT id, permissions FROM roles');
  for (const row of rows) {
    const perms = row.permissions as Record<string, PagePermission>;
    const missing = PAGE_KEYS.filter((key) => !(key in perms));
    if (missing.length === 0) continue;

    // Known system roles (admin/staff/viewer) inherit this key's shipped default;
    // custom roles get a safe "no access until an admin opts in" default.
    const knownDefaults = defaultsById.get(row.id);
    for (const key of missing) {
      perms[key] = knownDefaults?.[key] ?? { view: false, edit: false, delete: false, approve: false };
    }
    await pool.query('UPDATE roles SET permissions = $1 WHERE id = $2', [JSON.stringify(perms), row.id]);
  }
}

export async function ensureRolesTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS roles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      permissions JSONB NOT NULL DEFAULT '{}',
      is_system BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  for (const role of DEFAULT_ROLES) {
    await pool.query(
      `INSERT INTO roles (id, name, description, permissions, is_system)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO NOTHING`,
      [role.id, role.name, role.description, JSON.stringify(role.permissions), role.is_system]
    );
  }

  await migrateLegacyPermissions();
  await backfillMissingPageKeys();
}

// GET /roles — list all roles
router.get('/', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM roles ORDER BY created_at ASC');
    res.json({ data: rows, error: null });
  } catch (err: any) {
    res.status(500).json({ data: null, error: err.message });
  }
});

// GET /roles/:id — get single role with permissions
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM roles WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ data: null, error: 'Role not found' });
    res.json({ data: rows[0], error: null });
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
    const { rows } = await pool.query(
      `INSERT INTO roles (id, name, description, permissions, is_system)
       VALUES ($1, $2, $3, $4, false)
       RETURNING *`,
      [id, name.trim(), description || null, JSON.stringify(permissions ?? {})]
    );
    res.status(201).json({ data: rows[0], error: null });
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
    const existing = await pool.query('SELECT * FROM roles WHERE id = $1', [req.params.id]);
    if (!existing.rows[0]) {
      return res.status(404).json({ data: null, error: 'Role not found' });
    }

    const role = existing.rows[0];
    const updatedName        = role.is_system ? role.name        : (name?.trim()   ?? role.name);
    const updatedDescription = description !== undefined           ? description     : role.description;
    const updatedPermissions = permissions !== undefined           ? permissions     : role.permissions;

    const { rows } = await pool.query(
      `UPDATE roles
       SET name = $1, description = $2, permissions = $3, updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [updatedName, updatedDescription, JSON.stringify(updatedPermissions), req.params.id]
    );
    res.json({ data: rows[0], error: null });
  } catch (err: any) {
    res.status(500).json({ data: null, error: err.message });
  }
});

// DELETE /roles/:id — delete a custom role (system roles are protected)
router.delete('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const { rows } = await pool.query('SELECT is_system FROM roles WHERE id = $1', [req.params.id]);
    if (!rows[0]) {
      return res.status(404).json({ data: null, error: 'Role not found' });
    }
    if (rows[0].is_system) {
      return res.status(403).json({ data: null, error: 'System roles cannot be deleted' });
    }

    await pool.query('DELETE FROM roles WHERE id = $1', [req.params.id]);
    res.json({ data: { id: req.params.id }, error: null });
  } catch (err: any) {
    res.status(500).json({ data: null, error: err.message });
  }
});

export default router;
