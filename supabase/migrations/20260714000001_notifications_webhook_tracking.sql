-- Notification Settings' "Webhook Integrations" claimed to fire automatically
-- alongside other channels, but nothing ever actually triggered them outside
-- the manual "Test" button — there was no way to track which notifications
-- still need a webhook attempt. These columns let the background dispatcher
-- sweep pending notifications and send them for real, same as email.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS is_webhook_sent boolean NOT NULL DEFAULT false;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS webhook_attempts integer NOT NULL DEFAULT 0;
