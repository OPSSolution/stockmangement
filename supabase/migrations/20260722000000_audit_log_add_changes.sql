-- Structured before/after field diffs for update actions, so the Activity Log
-- detail view can show exactly what changed (e.g. "Price: $10.00 → $12.00")
-- instead of just a generic "Updated product X" description.
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS changes JSONB;
