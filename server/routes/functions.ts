import { Router } from 'express';
import { generateKeyPairSync } from 'crypto';
import { authenticate, AuthRequest } from '../middleware/auth';
import { supabaseForToken, supabaseAdmin } from '../lib/supabaseEnv';
import { evaluateAlertRules } from '../lib/alertRulesEvaluator';
import { dispatchPendingNotifications } from '../lib/notificationDispatch';

const router = Router();

// UTC [gte, lt) bounds for a period pattern — used for the `deliveries` table,
// whose created_at is a real timestamptz (every other reported table stores
// created_at as a 'YYYY-MM-DD[ HH24:MI]' text prefix, matched with `.like`).
function periodRangeUTC(period: 'daily' | 'monthly' | 'yearly', pattern: string) {
  if (period === 'daily') {
    const start = new Date(`${pattern}T00:00:00.000Z`);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    return { gte: start.toISOString(), lt: end.toISOString() };
  }
  if (period === 'monthly') {
    const [y, m] = pattern.split('-').map(Number);
    return { gte: new Date(Date.UTC(y, m - 1, 1)).toISOString(), lt: new Date(Date.UTC(y, m, 1)).toISOString() };
  }
  const y = Number(pattern);
  return { gte: new Date(Date.UTC(y, 0, 1)).toISOString(), lt: new Date(Date.UTC(y + 1, 0, 1)).toISOString() };
}

function groupCount(rows: Array<Record<string, unknown>>, field: string): Record<string, number> {
  const m: Record<string, number> = {};
  for (const r of rows) {
    const key = String(r[field]);
    m[key] = (m[key] || 0) + 1;
  }
  return m;
}

// Replaces the Supabase edge function: alert-rules-evaluator
// Reads/writes Supabase (not the local Postgres pool) — alert_rules, products, and
// notifications all live in Supabase since that's what the rest of the app uses.
// Uses the service-role client when available so a rule evaluation triggered by
// any one user's click (or the background scheduler) still checks every admin's
// own category thresholds, not just the caller's.
router.post('/alert-rules-evaluator', async (req: AuthRequest, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const supabase = supabaseAdmin() || supabaseForToken(token);
  if (!supabase) return res.status(503).json({ error: 'Supabase is not configured on the server' });

  try {
    const result = await evaluateAlertRules(supabase);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /functions/v1/report-summary
router.post('/report-summary', async (req: AuthRequest, res) => {
  const { period, date, month, year, warehouse } = req.body as {
    period: 'daily' | 'monthly' | 'yearly';
    date?: string;
    month?: string;
    year?: string;
    warehouse?: string;
  };

  const token = req.headers.authorization?.replace('Bearer ', '');
  const supabase = supabaseForToken(token);
  if (!supabase) return res.status(503).json({ error: 'Supabase is not configured on the server' });

  try {
    let currPattern: string;
    let prevPattern: string;
    let trendItems: { label: string; pattern: string }[];

    if (period === 'daily') {
      const d = date || new Date().toISOString().slice(0, 10);
      currPattern = d;
      const prev = new Date(d); prev.setDate(prev.getDate() - 1);
      prevPattern = prev.toISOString().slice(0, 10);
      trendItems = Array.from({ length: 7 }, (_, i) => {
        const day = new Date(d); day.setDate(day.getDate() - (6 - i));
        return {
          label: day.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
          pattern: day.toISOString().slice(0, 10),
        };
      });
    } else if (period === 'monthly') {
      currPattern = month || new Date().toISOString().slice(0, 7);
      const [y, m] = currPattern.split('-').map(Number);
      const prevDate = new Date(y, m - 2, 1);
      prevPattern = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
      const yr = currPattern.slice(0, 4);
      trendItems = Array.from({ length: 12 }, (_, i) => ({
        label: new Date(Number(yr), i, 1).toLocaleDateString('en-US', { month: 'short' }),
        pattern: `${yr}-${String(i + 1).padStart(2, '0')}`,
      }));
    } else {
      currPattern = year || String(new Date().getFullYear());
      prevPattern = String(Number(currPattern) - 1);
      trendItems = Array.from({ length: 5 }, (_, i) => {
        const yr = String(Number(currPattern) - (4 - i));
        return { label: yr, pattern: yr };
      });
    }

    const wh = warehouse || null;

    const getSummary = async (pat: string) => {
      const delRange = periodRangeUTC(period, pat);

      let purchasesQ = supabase.from('purchases').select('total,status').like('created_at', `${pat}%`);
      if (wh) purchasesQ = purchasesQ.eq('warehouse', wh);
      let returnsQ = supabase.from('returns').select('refund_amount,status').like('created_at', `${pat}%`);
      if (wh) returnsQ = returnsQ.eq('warehouse', wh);

      const [ordRes, delRes, trnRes, purRes, retRes, proRes] = await Promise.all([
        supabase.from('orders').select('total,status').like('created_at', `${pat}%`),
        supabase.from('deliveries').select('status').gte('created_at', delRange.gte).lt('created_at', delRange.lt),
        supabase.from('transfers').select('status').like('created_at', `${pat}%`),
        purchasesQ,
        returnsQ,
        supabase.from('promotions').select('status').like('created_at', `${pat}%`),
      ]);

      const ordRows = ordRes.data ?? [];
      const delRows = delRes.data ?? [];
      const trnRows = trnRes.data ?? [];
      const purRows = purRes.data ?? [];
      const retRows = retRes.data ?? [];
      const proRows = proRes.data ?? [];

      return {
        orders:     { count: ordRows.length, revenue: ordRows.reduce((s, r) => s + Number(r.total || 0), 0), statusBreakdown: groupCount(ordRows, 'status') },
        deliveries: { count: delRows.length, statusBreakdown: groupCount(delRows, 'status') },
        transfers:  { count: trnRows.length, statusBreakdown: groupCount(trnRows, 'status') },
        purchases:  { count: purRows.length, total: purRows.reduce((s, r) => s + Number(r.total || 0), 0), statusBreakdown: groupCount(purRows, 'status') },
        returns:    { count: retRows.length, refunded: retRows.reduce((s, r) => s + Number(r.refund_amount || 0), 0), statusBreakdown: groupCount(retRows, 'status') },
        promotions: { count: proRows.length, statusBreakdown: groupCount(proRows, 'status') },
      };
    };

    const [current, previous, trend] = await Promise.all([
      getSummary(currPattern),
      getSummary(prevPattern),
      Promise.all(trendItems.map(async ({ label, pattern }) => {
        const { data } = await supabase.from('orders').select('total').like('created_at', `${pattern}%`);
        const rows = data ?? [];
        return { label, orders: rows.length, revenue: rows.reduce((s, r) => s + Number(r.total || 0), 0) };
      })),
    ]);

    res.json({ period, current, previous, trend });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /functions/v1/notify-admins  (public — the customer-facing order form
// has no logged-in user, so it can't read `profiles` under RLS to find who
// the admins are. Service-role bypasses that; this route only ever creates
// notifications, never reads/writes anything else, so it's safe unauthenticated.)
router.post('/notify-admins', async (req, res) => {
  const { type, title, message, data } = req.body as {
    type: string; title: string; message: string; data?: Record<string, unknown>;
  };
  if (!type || !title || !message) {
    return res.status(400).json({ success: false, error: 'type, title, and message are required' });
  }

  const admin = supabaseAdmin();
  if (!admin) return res.status(503).json({ success: false, error: 'Service role is not configured on the server' });

  try {
    const { data: admins, error: adminsErr } = await admin.from('profiles').select('id').eq('role', 'admin');
    if (adminsErr) throw adminsErr;
    if (!admins || admins.length === 0) return res.json({ success: true, notified: 0 });

    const rows = admins.map((a) => ({
      user_id: a.id,
      type,
      title,
      message,
      data: data ?? {},
      is_read: false,
      is_emailed: false,
      is_webhook_sent: false,
    }));
    const { error: insertErr } = await admin.from('notifications').insert(rows);
    if (insertErr) throw insertErr;
    res.json({ success: true, notified: admins.length });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /functions/v1/get-vapid-public-key
router.post('/get-vapid-public-key', (_req, res) => {
  const publicKey = process.env.VAPID_PUBLIC_KEY || '';
  if (!publicKey) {
    return res.status(404).json({ error: 'VAPID_PUBLIC_KEY not configured in environment' });
  }
  res.json({ publicKey });
});

// POST /functions/v1/notification-channel-status
// Reports whether each dispatch channel actually has credentials configured
// server-side — never returns the secrets themselves — so the settings page
// can show real status instead of implying every toggle works.
router.post('/notification-channel-status', (_req, res) => {
  res.json({
    emailConfigured: !!process.env.RESEND_API_KEY,
    pushConfigured: !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY),
  });
});

// POST /functions/v1/generate-vapid-keys  (admin only)
router.post('/generate-vapid-keys', authenticate, (_req: AuthRequest, res) => {
  try {
    const { publicKey: pub, privateKey: priv } = generateKeyPairSync('ec', {
      namedCurve: 'P-256',
    });

    const pubJwk = pub.export({ format: 'jwk' }) as Record<string, string>;
    const privJwk = priv.export({ format: 'jwk' }) as Record<string, string>;

    // Build 65-byte uncompressed point: 0x04 || x (32 bytes) || y (32 bytes)
    const x = Buffer.from(pubJwk.x, 'base64url');
    const y = Buffer.from(pubJwk.y, 'base64url');
    const uncompressed = Buffer.concat([Buffer.from([0x04]), x, y]);

    res.json({
      publicKey: uncompressed.toString('base64url'),
      privateKey: privJwk.d,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /functions/v1/webhook-dispatch  (admin only)
router.post('/webhook-dispatch', authenticate, async (req: AuthRequest, res) => {
  const { notification, config_ids } = req.body as {
    notification: { id: string; type: string; title: string; message: string };
    config_ids: string[];
  };

  if (!notification || !config_ids?.length) {
    return res.status(400).json({ dispatched: false, error: 'Missing notification or config_ids' });
  }

  const token = req.headers.authorization?.replace('Bearer ', '');
  const supabase = supabaseForToken(token);
  if (!supabase) return res.status(503).json({ dispatched: false, error: 'Supabase is not configured on the server' });

  try {
    const { data: configs } = await supabase
      .from('webhook_configs')
      .select('*')
      .in('id', config_ids)
      .eq('is_active', true);

    const results: Array<{ id: string; name: string; success: boolean; status?: number; error?: string }> = [];

    for (const config of configs ?? []) {
      try {
        let body: Record<string, unknown>;

        if (config.provider === 'slack') {
          body = { text: `*${notification.title}*\n${notification.message}` };
        } else if (config.provider === 'discord') {
          body = { content: `**${notification.title}**\n${notification.message}` };
        } else if (config.provider === 'telegram') {
          // webhook_url = https://api.telegram.org/bot{TOKEN}/sendMessage, secret_token = chat_id
          body = {
            chat_id: config.secret_token || '',
            text: `*${notification.title}*\n${notification.message}`,
            parse_mode: 'Markdown',
          };
        } else {
          body = { notification };
        }

        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (config.secret_token && config.provider !== 'telegram' && config.provider !== 'discord') {
          headers['Authorization'] = `Bearer ${config.secret_token}`;
        }

        const response = await fetch(config.webhook_url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        });

        results.push({ id: config.id, name: config.name, success: response.ok, status: response.status });
      } catch (err: any) {
        results.push({ id: config.id, name: config.name, success: false, error: err.message });
      }
    }

    const dispatched = results.length > 0 && results.some((r) => r.success);
    res.json({ dispatched, results });
  } catch (err: any) {
    res.status(500).json({ dispatched: false, error: err.message });
  }
});

// POST /functions/v1/scheduled-dispatch  (authenticated)
// Actually sends pending notifications out — email via Resend (if
// RESEND_API_KEY is set), webhooks to any matching active integration, and
// browser push (if VAPID keys are set) — instead of just marking rows sent.
router.post('/scheduled-dispatch', authenticate, async (req: AuthRequest, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const supabase = supabaseAdmin() || supabaseForToken(token);
  if (!supabase) return res.status(503).json({ message: 'Supabase is not configured on the server' });

  try {
    const { emailed, webhooked, pushed } = await dispatchPendingNotifications(supabase);
    const parts = [`${emailed} email${emailed !== 1 ? 's' : ''}`, `${webhooked} webhook${webhooked !== 1 ? 's' : ''}`, `${pushed} push${pushed !== 1 ? 'es' : ''}`];
    res.json({ message: `Dispatched: ${parts.join(', ')}`, emailed, webhooked, pushed });
  } catch (err: any) {
    res.status(500).json({ message: 'Dispatch failed: ' + err.message });
  }
});

// POST /functions/v1/invite-user  (admin only)
// Creates the user directly in Supabase Auth + the Supabase `profiles` table —
// that's the only database the real app (login, Teams, everything) reads from.
// Requires SUPABASE_SERVICE_ROLE_KEY to be set on the server; that key must
// never be exposed to the browser.
router.post('/invite-user', authenticate, async (req: AuthRequest, res) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }

  const { email, full_name = 'User', role = 'staff', phone, password } = req.body;

  if (!email) return res.status(400).json({ success: false, error: 'Email is required' });
  if (!['admin', 'staff', 'viewer'].includes(role)) {
    return res.status(400).json({ success: false, error: 'Invalid role' });
  }

  const admin = supabaseAdmin();
  if (!admin) {
    return res.status(500).json({
      success: false,
      error: 'SUPABASE_SERVICE_ROLE_KEY is not configured on the server — invite cannot create a real Supabase account without it.',
    });
  }

  const plainPassword = password || Math.random().toString(36).slice(-10);

  try {
    console.log(`[invite-user] creating auth user for ${email}`);
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: plainPassword,
      email_confirm: true,
      user_metadata: { full_name, role, phone: phone || null },
    });

    if (createErr || !created?.user) {
      console.log(`[invite-user] createUser failed:`, createErr?.message);
      return res.status(400).json({ success: false, error: createErr?.message || 'Failed to create user' });
    }

    const userId = created.user.id;
    console.log(`[invite-user] auth user created, id=${userId}`);

    // A DB trigger (on_auth_user_created) creates a bare-bones profiles row in
    // the same transaction as the auth user, so it already exists by now —
    // upsert to fill in the full details rather than insert (which would
    // conflict with the trigger's row).
    const { error: profileErr } = await admin
      .from('profiles')
      .upsert({ id: userId, email, full_name, role, phone: phone || null }, { onConflict: 'id' });

    if (profileErr) {
      console.log(`[invite-user] profile upsert failed, rolling back auth user ${userId}:`, profileErr.message);
      await admin.auth.admin.deleteUser(userId).catch((e) => console.log('[invite-user] rollback delete failed:', e));
      return res.status(500).json({ success: false, error: profileErr.message });
    }
    console.log(`[invite-user] profile upsert OK`);

    await admin.from('notification_settings').insert({
      user_id: userId,
      email_enabled: true,
      sms_enabled: false,
      in_app_enabled: true,
      browser_push_enabled: true,
      category_thresholds: { Electronics: 5, Furniture: 3, Lighting: 4, 'Smart Home': 5, Accessories: 10 },
    });

    res.json({ success: true, userId, email, role, tempPassword: password ? undefined : plainPassword });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
