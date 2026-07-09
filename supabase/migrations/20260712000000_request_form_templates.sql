-- ============================================================
-- Request Form Templates — lets admins define a custom set of
-- extra fields per company (e.g. UNT, SVP) that gets appended to
-- the standard stock request form when staff pick that company.
-- ============================================================

CREATE TABLE IF NOT EXISTS request_form_templates (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text,
  -- Array of { key, label, type, options?, required } field definitions.
  -- type is one of: text, number, date, textarea, select, checkbox.
  fields jsonb NOT NULL DEFAULT '[]',
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE request_form_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to request_form_templates"
  ON request_form_templates
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Which template (company) a request was filled out for, plus a
-- self-contained snapshot of the answers so historical requests stay
-- readable even if the template is later edited or removed.
ALTER TABLE stock_requests ADD COLUMN IF NOT EXISTS template_id text REFERENCES request_form_templates(id) ON DELETE SET NULL;
ALTER TABLE stock_requests ADD COLUMN IF NOT EXISTS template_name text;
ALTER TABLE stock_requests ADD COLUMN IF NOT EXISTS custom_fields jsonb NOT NULL DEFAULT '[]';
