-- ============================================================
-- General action audit trail (logins + create/update/delete across every
-- module) — distinct from the pre-existing `activity_log` table, which is
-- narrowly typed to stock movements (sale/purchase/transfer/return/
-- adjustment, with required product/quantity/warehouse columns) and feeds
-- the Dashboard's "Recent Activity" widget. That table stays untouched.
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT,
  user_name TEXT,
  user_role TEXT,
  action TEXT NOT NULL,   -- 'login' | 'create' | 'update' | 'delete'
  module TEXT NOT NULL,   -- 'auth' | 'inventory' | 'orders' | 'deliveries' | 'transfers' | 'requests' | 'returns' | 'purchases' | 'promotions' | 'vendors' | 'warehouses' | 'teams' | 'roles' | 'categories'
  description TEXT NOT NULL,
  reference_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_module_idx ON audit_log (module);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on audit_log" ON audit_log;
CREATE POLICY "Allow all on audit_log" ON audit_log FOR ALL USING (true) WITH CHECK (true);

-- Carry forward existing login_history rows so the combined Activity Log
-- doesn't lose sign-in history that predates this table.
INSERT INTO audit_log (user_id, user_name, user_role, action, module, description, created_at)
SELECT user_id, full_name, role, 'login', 'auth', 'Signed in', created_at
FROM login_history;
