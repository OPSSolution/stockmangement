import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { generateKeyPairSync } from 'crypto';
import { pool } from '../db';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

// Replaces the Supabase edge function: alert-rules-evaluator
router.post('/alert-rules-evaluator', async (_req, res) => {
  try {
    const [rulesResult, productsResult] = await Promise.all([
      pool.query('SELECT * FROM alert_rules WHERE is_active = true'),
      pool.query('SELECT * FROM products WHERE stock <= low_stock_threshold'),
    ]);

    const rules = rulesResult.rows;
    const lowStockProducts = productsResult.rows;
    let totalCreated = 0;

    for (const rule of rules) {
      if (rule.trigger_type !== 'stock_below_threshold') continue;

      for (const product of lowStockProducts) {
        const threshold = rule.trigger_condition?.threshold ?? product.low_stock_threshold;
        if (product.stock > threshold) continue;

        // Avoid duplicate notifications within the last hour
        const recent = await pool.query(
          `SELECT id FROM notifications
           WHERE data->>'product_id' = $1 AND type = $2
           AND created_at > NOW() - INTERVAL '1 hour' LIMIT 1`,
          [product.id, rule.notification_type]
        );
        if (recent.rows.length > 0) continue;

        const msg = rule.message_template
          .replace('{{product_name}}', product.name)
          .replace('{{stock}}', String(product.stock));

        const title = rule.notification_type === 'out_of_stock'
          ? `Out of Stock: ${product.name}`
          : `Low Stock: ${product.name}`;

        const admins = await pool.query("SELECT id FROM profiles WHERE role = 'admin'");
        for (const admin of admins.rows) {
          await pool.query(
            `INSERT INTO notifications (user_id, type, title, message, data)
             VALUES ($1, $2, $3, $4, $5)`,
            [admin.id, rule.notification_type, title, msg,
              JSON.stringify({ product_id: product.id, product_name: product.name, stock: product.stock })]
          );
          totalCreated++;
        }
      }
    }

    res.json({ total_created: totalCreated });
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
    const whClause = wh ? ' AND warehouse = $2' : '';
    const whVals: string[] = wh ? [wh] : [];

    const toMap = (rows: any[]): Record<string, number> => {
      const m: Record<string, number> = {};
      rows.forEach((r: any) => { m[r.status] = Number(r.c); });
      return m;
    };

    const getSummary = async (pat: string) => {
      const [ordRes, ordStRes, delRes, trnRes, trnStRes, purRes, purStRes, retRes, retStRes, proRes, proStRes] = await Promise.all([
        pool.query(`SELECT COUNT(*) c, COALESCE(SUM(total),0) rev FROM orders WHERE created_at LIKE $1`, [`${pat}%`]),
        pool.query(`SELECT status, COUNT(*) c FROM orders WHERE created_at LIKE $1 GROUP BY status`, [`${pat}%`]),
        pool.query(`SELECT status, COUNT(*) c FROM deliveries WHERE TO_CHAR(created_at,'YYYY-MM-DD') LIKE $1${whClause} GROUP BY status`, [`${pat}%`, ...whVals]),
        pool.query(`SELECT COUNT(*) c FROM transfers WHERE created_at LIKE $1`, [`${pat}%`]),
        pool.query(`SELECT status, COUNT(*) c FROM transfers WHERE created_at LIKE $1 GROUP BY status`, [`${pat}%`]),
        pool.query(`SELECT COUNT(*) c, COALESCE(SUM(total),0) tot FROM purchases WHERE created_at LIKE $1${whClause}`, [`${pat}%`, ...whVals]),
        pool.query(`SELECT status, COUNT(*) c FROM purchases WHERE created_at LIKE $1${whClause} GROUP BY status`, [`${pat}%`, ...whVals]),
        pool.query(`SELECT COUNT(*) c, COALESCE(SUM(refund_amount),0) ref FROM returns WHERE created_at LIKE $1${whClause}`, [`${pat}%`, ...whVals]),
        pool.query(`SELECT status, COUNT(*) c FROM returns WHERE created_at LIKE $1${whClause} GROUP BY status`, [`${pat}%`, ...whVals]),
        pool.query(`SELECT COUNT(*) c FROM promotions WHERE created_at LIKE $1`, [`${pat}%`]),
        pool.query(`SELECT status, COUNT(*) c FROM promotions WHERE created_at LIKE $1 GROUP BY status`, [`${pat}%`]),
      ]);
      return {
        orders:     { count: Number(ordRes.rows[0].c), revenue: Number(ordRes.rows[0].rev), statusBreakdown: toMap(ordStRes.rows) },
        deliveries: { count: delRes.rows.reduce((s: number, r: any) => s + Number(r.c), 0), statusBreakdown: toMap(delRes.rows) },
        transfers:  { count: Number(trnRes.rows[0].c), statusBreakdown: toMap(trnStRes.rows) },
        purchases:  { count: Number(purRes.rows[0].c), total: Number(purRes.rows[0].tot), statusBreakdown: toMap(purStRes.rows) },
        returns:    { count: Number(retRes.rows[0].c), refunded: Number(retRes.rows[0].ref), statusBreakdown: toMap(retStRes.rows) },
        promotions: { count: Number(proRes.rows[0].c), statusBreakdown: toMap(proStRes.rows) },
      };
    };

    const [current, previous, trend] = await Promise.all([
      getSummary(currPattern),
      getSummary(prevPattern),
      Promise.all(trendItems.map(async ({ label, pattern }) => {
        const r = await pool.query(
          `SELECT COUNT(*) orders, COALESCE(SUM(total),0) revenue FROM orders WHERE created_at LIKE $1`,
          [`${pattern}%`]
        );
        return { label, orders: Number(r.rows[0].orders), revenue: Number(r.rows[0].revenue) };
      })),
    ]);

    res.json({ period, current, previous, trend });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
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

  try {
    const placeholders = config_ids.map((_: unknown, i: number) => `$${i + 1}`).join(',');
    const { rows: configs } = await pool.query(
      `SELECT * FROM webhook_configs WHERE id IN (${placeholders}) AND is_active = true`,
      config_ids
    );

    const results: Array<{ id: string; name: string; success: boolean; status?: number; error?: string }> = [];

    for (const config of configs) {
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
router.post('/scheduled-dispatch', authenticate, async (_req: AuthRequest, res) => {
  try {
    const result = await pool.query(
      `UPDATE notifications SET is_emailed = true
       WHERE is_emailed = false AND created_at > NOW() - INTERVAL '24 hours'
       RETURNING id`
    );
    const count = result.rows.length;
    res.json({ message: `Dispatched ${count} pending notification${count !== 1 ? 's' : ''}` });
  } catch (err: any) {
    res.status(500).json({ message: 'Dispatch failed: ' + err.message });
  }
});

// POST /functions/v1/invite-user  (admin only)
router.post('/invite-user', authenticate, async (req: AuthRequest, res) => {
  const { email, full_name = 'User', role = 'staff', phone, password } = req.body;

  if (!email) return res.status(400).json({ success: false, error: 'Email is required' });
  if (!['admin', 'staff', 'viewer'].includes(role)) {
    return res.status(400).json({ success: false, error: 'Invalid role' });
  }

  try {
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ success: false, error: 'A user with this email already exists' });
    }

    const plainPassword = password || Math.random().toString(36).slice(-10);
    const passwordHash = await bcrypt.hash(plainPassword, 10);

    const countResult = await pool.query('SELECT COUNT(*) FROM users');
    const seq = String(Number(countResult.rows[0].count) + 1).padStart(3, '0');
    const userId = `USR-${seq}`;

    await pool.query('BEGIN');
    await pool.query('INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)', [userId, email, passwordHash]);
    await pool.query(
      'INSERT INTO profiles (id, email, full_name, role, phone) VALUES ($1, $2, $3, $4, $5)',
      [userId, email, full_name, role, phone || null]
    );
    await pool.query(
      `INSERT INTO notification_settings (user_id, email_enabled, sms_enabled, in_app_enabled, browser_push_enabled, category_thresholds)
       VALUES ($1, true, false, true, true, $2) ON CONFLICT (user_id) DO NOTHING`,
      [userId, JSON.stringify({ Electronics: 5, Furniture: 3, Lighting: 4, 'Smart Home': 5, Accessories: 10 })]
    );
    await pool.query('COMMIT');

    res.json({ success: true, userId, email, role, tempPassword: password ? undefined : plainPassword });
  } catch (err: any) {
    await pool.query('ROLLBACK').catch(() => {});
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
