// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface AlertRule {
  id: string;
  name: string;
  trigger_type: string;
  trigger_condition: Record<string, unknown>;
  notification_type: string;
  message_template: string;
  is_active: boolean;
}

async function sendBrowserPush(client: ReturnType<typeof createClient>, notification: Record<string, unknown>, supabaseUrl: string, serviceKey: string) {
  try {
    await fetch(
      `${supabaseUrl}/functions/v1/send-browser-push`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ notification }),
      }
    );
  } catch (err) {
    console.error('Failed to send browser push:', (err as Error).message);
  }
}

Deno.cron('Evaluate custom alert rules every 10 minutes', '*/10 * * * *', async () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const adminClient = createClient(supabaseUrl, serviceKey);

  const { data: rules, error: rulesErr } = await adminClient
    .from('alert_rules')
    .select('*')
    .eq('is_active', true);

  if (rulesErr || !rules || rules.length === 0) {
    console.log('No active alert rules to evaluate');
    return;
  }

  for (const rule of rules as AlertRule[]) {
    try {
      await evaluateRule(adminClient, rule, supabaseUrl, serviceKey);
    } catch (err) {
      console.error(`Error evaluating rule ${rule.id}:`, (err as Error).message);
    }
  }
});

async function evaluateRule(
  client: ReturnType<typeof createClient>,
  rule: AlertRule,
  supabaseUrl?: string,
  serviceKey?: string
) {
  const condition = rule.trigger_condition;
  const olderThanHours = (condition.older_than_hours as number) || 24;
  const cutoff = new Date(Date.now() - olderThanHours * 3600000).toISOString();
  const sUrl = supabaseUrl || Deno.env.get('SUPABASE_URL')!;
  const sKey = serviceKey || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  switch (rule.trigger_type) {
    case 'order_pending_aging': {
      const { data: orders } = await client
        .from('orders')
        .select('id, status, created_at')
        .eq('status', condition.status || 'pending')
        .lt('created_at', cutoff);

      if (orders && orders.length > 0) {
        const { data: existing } = await client
          .from('notifications')
          .select('data')
          .eq('type', rule.notification_type)
          .eq('title', `Rule: ${rule.name}`)
          .gte('created_at', new Date(Date.now() - olderThanHours * 3600000).toISOString());

        const notifiedIds = new Set(
          (existing || []).map((n) => (n.data as Record<string, unknown>)?.order_id as string).filter(Boolean)
        );

        const newOrders = orders.filter((o) => !notifiedIds.has(o.id));
        for (const order of newOrders) {
          const message = rule.message_template
            .replace('{{data.order_id}}', order.id)
            .replace('{{name}}', rule.name);

          const notif = {
            type: rule.notification_type,
            title: `Rule: ${rule.name}`,
            message,
            data: { order_id: order.id, rule_id: rule.id, rule_name: rule.name },
            is_read: false,
            is_emailed: false,
            is_sms_sent: false,
            is_webhook_sent: false,
          };
          await client.from('notifications').insert(notif);
          if (notif.type === 'low_stock' || notif.type === 'out_of_stock') {
            await sendBrowserPush(client, notif, sUrl, sKey);
          }
        }
        console.log(`Rule ${rule.id}: Created ${newOrders.length} notifications for pending orders`);
      }
      break;
    }

    case 'return_unresolved': {
      const { data: returns } = await client
        .from('returns')
        .select('id, status, created_at')
        .eq('status', condition.status || 'pending_inspection')
        .lt('created_at', cutoff);

      if (returns && returns.length > 0) {
        const { data: existing } = await client
          .from('notifications')
          .select('data')
          .eq('type', rule.notification_type)
          .eq('title', `Rule: ${rule.name}`)
          .gte('created_at', new Date(Date.now() - olderThanHours * 3600000).toISOString());

        const notifiedIds = new Set(
          (existing || []).map((n) => (n.data as Record<string, unknown>)?.return_id as string).filter(Boolean)
        );

        const newReturns = returns.filter((r) => !notifiedIds.has(r.id));
        for (const ret of newReturns) {
          const message = rule.message_template
            .replace('{{data.return_id}}', ret.id)
            .replace('{{name}}', rule.name);

          const notif = {
            type: rule.notification_type,
            title: `Rule: ${rule.name}`,
            message,
            data: { return_id: ret.id, rule_id: rule.id, rule_name: rule.name },
            is_read: false,
            is_emailed: false,
            is_sms_sent: false,
            is_webhook_sent: false,
          };
          await client.from('notifications').insert(notif);
          if (notif.type === 'low_stock' || notif.type === 'out_of_stock') {
            await sendBrowserPush(client, notif, sUrl, sKey);
          }
        }
        console.log(`Rule ${rule.id}: Created ${newReturns.length} notifications for returns`);
      }
      break;
    }

    case 'transfer_overdue': {
      const { data: transfers } = await client
        .from('transfers')
        .select('id, status, created_at')
        .eq('status', condition.status || 'requested')
        .lt('created_at', cutoff);

      if (transfers && transfers.length > 0) {
        const { data: existing } = await client
          .from('notifications')
          .select('data')
          .eq('type', rule.notification_type)
          .eq('title', `Rule: ${rule.name}`)
          .gte('created_at', new Date(Date.now() - olderThanHours * 3600000).toISOString());

        const notifiedIds = new Set(
          (existing || []).map((n) => (n.data as Record<string, unknown>)?.transfer_id as string).filter(Boolean)
        );

        const newTransfers = transfers.filter((t) => !notifiedIds.has(t.id));
        for (const transfer of newTransfers) {
          const message = rule.message_template
            .replace('{{data.transfer_id}}', transfer.id)
            .replace('{{name}}', rule.name);

          const notif = {
            type: rule.notification_type,
            title: `Rule: ${rule.name}`,
            message,
            data: { transfer_id: transfer.id, rule_id: rule.id, rule_name: rule.name },
            is_read: false,
            is_emailed: false,
            is_sms_sent: false,
            is_webhook_sent: false,
          };
          await client.from('notifications').insert(notif);
          if (notif.type === 'low_stock' || notif.type === 'out_of_stock') {
            await sendBrowserPush(client, notif, sUrl, sKey);
          }
        }
        console.log(`Rule ${rule.id}: Created ${newTransfers.length} notifications for transfers`);
      }
      break;
    }

    case 'stock_below_threshold': {
      const category = condition.category as string | undefined;
      const threshold = (condition.threshold as number) || 5;

      const { data: stockRows } = await client
        .from('product_warehouse_stock')
        .select('warehouse, stock, product:products(id, name, sku, category)')
        .lt('stock', threshold);

      const products = (stockRows || [])
        .filter((row) => row.product && (!category || row.product.category === category))
        .map((row) => ({
          id: row.product.id,
          name: row.product.name,
          sku: row.product.sku,
          category: row.product.category,
          stock: row.stock,
          warehouse: row.warehouse as string,
        }));

      if (products && products.length > 0) {
        const { data: existing } = await client
          .from('notifications')
          .select('data')
          .eq('type', 'low_stock')
          .gte('created_at', new Date(Date.now() - 3600000).toISOString());

        const notified = new Set(
          (existing || []).map((n) => {
            const d = (n.data as Record<string, unknown>) || {};
            return `${d.product_id}::${d.warehouse}`;
          }).filter(Boolean)
        );

        const newProducts = products.filter((p) => !notified.has(`${p.id}::${p.warehouse}`));
        for (const product of newProducts) {
          const notif = {
            type: 'low_stock',
            title: `Low Stock: ${product.name}`,
            message: `${product.name} (${product.sku}) in ${product.category} has only ${product.stock} units remaining at ${product.warehouse}. Threshold: ${threshold}.`,
            data: { product_id: product.id, warehouse: product.warehouse, rule_id: rule.id, rule_name: rule.name },
            is_read: false,
            is_emailed: false,
            is_sms_sent: false,
            is_webhook_sent: false,
          };
          await client.from('notifications').insert(notif);
          await sendBrowserPush(client, notif, sUrl, sKey);
        }
        console.log(`Rule ${rule.id}: Created ${newProducts.length} notifications for low stock`);
      }
      break;
    }

    default:
      console.log(`Unknown trigger type: ${rule.trigger_type}`);
  }
}

// Manual trigger endpoint
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminClient = createClient(supabaseUrl, serviceKey);

    const { data: rules } = await adminClient
      .from('alert_rules')
      .select('*')
      .eq('is_active', true);

    let totalCreated = 0;

    if (rules) {
      for (const rule of rules as AlertRule[]) {
        try {
          await evaluateRule(adminClient, rule, supabaseUrl, serviceKey);
          // Count created notifications for this rule in the last minute
          const { data: recent } = await adminClient
            .from('notifications')
            .select('id', { count: 'exact', head: true })
            .eq('type', rule.notification_type)
            .gte('created_at', new Date(Date.now() - 60000).toISOString());
          totalCreated += recent?.length || 0;
        } catch (ruleErr) {
          console.error(`Manual eval error for rule ${rule.id}:`, (ruleErr as Error).message);
        }
      }
    }

    return new Response(
      JSON.stringify({ evaluated: rules?.length || 0, total_created: totalCreated }),
      { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
});
