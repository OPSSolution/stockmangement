-- ============================================================
-- Tracks every real sign-in (not page refreshes/token renewals) so admins
-- can see who logged in and when. Fields are stored as a plain snapshot
-- (not a live FK join to profiles) matching the pattern already used by
-- stock_history.user_name and stock_requests.submitted_by.
-- ============================================================

CREATE TABLE IF NOT EXISTS login_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT,
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS login_history_created_at_idx ON login_history (created_at DESC);

ALTER TABLE login_history ENABLE ROW LEVEL SECURITY;

-- Matches the permissive "allow all, gate in app layer" policy style already
-- used by every other table in this project.
DROP POLICY IF EXISTS "Allow all on login_history" ON login_history;
CREATE POLICY "Allow all on login_history" ON login_history FOR ALL USING (true) WITH CHECK (true);
