-- ============================================================
-- Request Form Templates — optional logo shown next to the
-- company name in the admin list and the "New Request" picker.
-- ============================================================

ALTER TABLE request_form_templates ADD COLUMN IF NOT EXISTS logo_url text;
