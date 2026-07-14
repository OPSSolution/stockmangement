import webpush from 'web-push';
import type { SupabaseClient } from '@supabase/supabase-js';

interface NotificationRow {
  id: string;
  user_id: string | null;
  type: string;
  title: string;
  message: string;
  data: Record<string, unknown> | null;
  is_emailed: boolean;
  is_webhook_sent: boolean;
  webhook_attempts: number;
  created_at: string;
}

interface SettingsRow {
  user_id: string;
  email_enabled: boolean;
  browser_push_enabled: boolean;
  category_thresholds: Record<string, number>;
}

interface WebhookConfigRow {
  id: string;
  provider: 'slack' | 'discord' | 'telegram' | 'custom';
  webhook_url: string;
  secret_token: string | null;
  is_active: boolean;
  notify_on_types: string[];
}

const PUSH_ELIGIBLE_TYPES = new Set(['low_stock', 'out_of_stock']);

async function sendEmail(title: string, message: string, type: string, toEmail: string): Promise<boolean> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return false;
  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || 'alerts@warehouse.app',
        to: toEmail,
        subject: `[${type.toUpperCase()}] ${title}`,
        html: `<p><strong>${title}</strong></p><p>${message}</p>`,
      }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

function buildWebhookBody(config: WebhookConfigRow, title: string, message: string): Record<string, unknown> {
  if (config.provider === 'slack') return { text: `*${title}*\n${message}` };
  if (config.provider === 'discord') return { content: `**${title}**\n${message}` };
  if (config.provider === 'telegram') {
    return { chat_id: config.secret_token || '', text: `*${title}*\n${message}`, parse_mode: 'Markdown' };
  }
  return { title, message };
}

async function sendToWebhook(config: WebhookConfigRow, title: string, message: string): Promise<boolean> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (config.secret_token && config.provider !== 'telegram' && config.provider !== 'discord') {
      headers['Authorization'] = `Bearer ${config.secret_token}`;
    }
    const resp = await fetch(config.webhook_url, {
      method: 'POST',
      headers,
      body: JSON.stringify(buildWebhookBody(config, title, message)),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

let vapidConfigured = false;
function ensureVapidConfigured() {
  if (vapidConfigured) return true;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails('mailto:alerts@warehouse.app', publicKey, privateKey);
  vapidConfigured = true;
  return true;
}

async function sendPushToUser(supabase: SupabaseClient, userId: string, title: string, message: string) {
  if (!ensureVapidConfigured()) return;
  const { data: subs } = await supabase.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', userId);
  for (const sub of subs ?? []) {
    if (!sub.p256dh || !sub.auth) continue;
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({ title, body: message })
      );
    } catch (err: unknown) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      // 404/410 means the browser unsubscribed or the endpoint expired — clean it up.
      if (statusCode === 404 || statusCode === 410) {
        await supabase.from('push_subscriptions').delete().eq('id', sub.id);
      }
    }
  }
}

/**
 * Sweeps notifications that haven't gone out on every channel yet and actually
 * sends them — email via Resend (if RESEND_API_KEY is set), webhooks to any
 * active integration matching the notification type, and browser push (if
 * VAPID keys are set). Replaces the old stub that just marked rows as sent
 * without sending anything.
 */
export async function dispatchPendingNotifications(supabase: SupabaseClient) {
  const { data: pending } = await supabase
    .from('notifications')
    .select('*')
    .or('is_emailed.eq.false,is_webhook_sent.eq.false')
    .order('created_at', { ascending: true })
    .limit(100);

  const notifications = (pending ?? []) as NotificationRow[];
  if (notifications.length === 0) return { emailed: 0, webhooked: 0, pushed: 0 };

  const userIds = [...new Set(notifications.map((n) => n.user_id).filter(Boolean))] as string[];

  const [profilesRes, settingsRes, webhooksRes] = await Promise.all([
    userIds.length > 0 ? supabase.from('profiles').select('id, email').in('id', userIds) : Promise.resolve({ data: [] }),
    userIds.length > 0 ? supabase.from('notification_settings').select('user_id, email_enabled, browser_push_enabled, category_thresholds').in('user_id', userIds) : Promise.resolve({ data: [] }),
    supabase.from('webhook_configs').select('*').eq('is_active', true),
  ]);

  const emailByUser = new Map<string, string>((profilesRes.data ?? []).map((p: { id: string; email: string }) => [p.id, p.email]));
  const settingsByUser = new Map<string, SettingsRow>((settingsRes.data ?? []).map((s: SettingsRow) => [s.user_id, s]));
  const activeWebhooks = (webhooksRes.data ?? []) as WebhookConfigRow[];

  let emailed = 0;
  let webhooked = 0;
  let pushed = 0;

  for (const n of notifications) {
    const settings = n.user_id ? settingsByUser.get(n.user_id) : undefined;

    if (!n.is_emailed) {
      const emailOk = !settings || settings.email_enabled;
      const toEmail = n.user_id ? emailByUser.get(n.user_id) : undefined;
      if (emailOk && toEmail) {
        const sent = await sendEmail(n.title, n.message, n.type, toEmail);
        if (sent) {
          await supabase.from('notifications').update({ is_emailed: true }).eq('id', n.id);
          emailed++;
        }
      }
    }

    if (!n.is_webhook_sent && n.webhook_attempts < 5) {
      const matching = activeWebhooks.filter((w) => !w.notify_on_types?.length || w.notify_on_types.includes(n.type));
      if (matching.length > 0) {
        const results = await Promise.all(matching.map((w) => sendToWebhook(w, n.title, n.message)));
        const anySuccess = results.some(Boolean);
        await supabase.from('notifications').update({
          is_webhook_sent: anySuccess,
          webhook_attempts: n.webhook_attempts + 1,
        }).eq('id', n.id);
        if (anySuccess) webhooked++;
      }
    }

    if (PUSH_ELIGIBLE_TYPES.has(n.type) && n.user_id && (!settings || settings.browser_push_enabled)) {
      await sendPushToUser(supabase, n.user_id, n.title, n.message);
      pushed++;
    }
  }

  return { emailed, webhooked, pushed };
}
