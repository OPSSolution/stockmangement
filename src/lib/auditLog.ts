import { supabase } from './supabase';

export type AuditAction = 'login' | 'logout' | 'create' | 'update' | 'delete';

export type AuditModule =
  | 'auth'
  | 'inventory'
  | 'orders'
  | 'deliveries'
  | 'transfers'
  | 'requests'
  | 'returns'
  | 'purchases'
  | 'promotions'
  | 'vendors'
  | 'warehouses'
  | 'teams'
  | 'roles'
  | 'categories'
  | 'notifications'
  | 'requirements'
  | 'request_templates';

export interface AuditFieldChange {
  field: string;
  from: string | number | boolean | null;
  to: string | number | boolean | null;
}

interface LogAuditOptions {
  action: AuditAction;
  module: AuditModule;
  description: string;
  referenceId?: string;
  changes?: AuditFieldChange[];
}

/**
 * Records a create/update/delete action (or login) to the shared audit trail
 * shown as "Activity Log" in Teams. Self-contained — reads the current user
 * from the local session, so callers never need to plumb user info through.
 * Fire-and-forget: never await this, a logging failure shouldn't block the
 * action it's describing.
 */
export function logAudit(opts: LogAuditOptions) {
  supabase.auth.getSession().then(({ data }) => {
    const authUser = data.session?.user;
    const meta = authUser?.user_metadata ?? {};
    supabase.from('audit_log').insert({
      user_id: authUser?.id ?? null,
      user_name: (meta.full_name as string) || authUser?.email || null,
      user_role: (meta.role as string) || null,
      action: opts.action,
      module: opts.module,
      description: opts.description,
      reference_id: opts.referenceId ?? null,
      changes: opts.changes && opts.changes.length > 0 ? opts.changes : null,
    }).then(({ error }) => {
      if (error) console.error('Failed to record activity:', error.message);
    });
  });
}

/** Compares two records field-by-field and returns only the fields that actually changed. */
export function diffFields<T>(
  before: T,
  after: T,
  fields: { key: keyof T; label: string }[]
): AuditFieldChange[] {
  const changes: AuditFieldChange[] = [];
  for (const { key, label } of fields) {
    const from = before[key];
    const to = after[key];
    if (from === to) continue;
    // undefined, null, and '' are all "empty" — don't treat them as different values from each other.
    const normalize = (v: unknown): string | number | boolean | null =>
      v === undefined || v === null || v === '' ? null : (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? v : String(v));
    const fromN = normalize(from);
    const toN = normalize(to);
    if (fromN === toN) continue;
    changes.push({ field: label, from: fromN, to: toN });
  }
  return changes;
}
