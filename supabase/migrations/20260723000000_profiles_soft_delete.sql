-- Removing a team member is a soft delete: the profiles row is kept (with a
-- deleted_at timestamp) instead of being physically removed, so past activity
-- (audit log entries, orders/requests they created, etc.) still attributes
-- correctly to a real record instead of a dangling/deleted user.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS profiles_deleted_at_idx ON profiles (deleted_at);
