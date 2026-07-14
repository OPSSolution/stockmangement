import type { SupabaseClient } from '@supabase/supabase-js';

interface AlertRule {
  id: string;
  name: string;
  trigger_type: string;
  trigger_condition: Record<string, unknown>;
  notification_type: string;
  message_template: string;
  is_active: boolean;
}

interface RecipientSettings {
  user_id: string;
  category_thresholds: Record<string, number>;
}

async function alreadyNotified(supabase: SupabaseClient, notificationType: string, ruleName: string, dataKey: string, sinceIso: string): Promise<Set<string>> {
  const { data } = await supabase
    .from('notifications')
    .select('data')
    .eq('type', notificationType)
    .eq('title', `Rule: ${ruleName}`)
    .gte('created_at', sinceIso);
  return new Set((data ?? []).map((n: { data: Record<string, unknown> | null }) => n.data?.[dataKey] as string).filter(Boolean));
}

async function evaluateAgingRule(
  supabase: SupabaseClient,
  rule: AlertRule,
  table: 'orders' | 'returns' | 'transfers',
  dataKey: string,
  defaultStatus: string
) {
  const olderThanHours = (rule.trigger_condition.older_than_hours as number) || 24;
  const status = (rule.trigger_condition.status as string) || defaultStatus;
  const cutoff = new Date(Date.now() - olderThanHours * 3600000).toISOString();

  const { data: rows } = await supabase.from(table).select('id, status, created_at').eq('status', status).lt('created_at', cutoff);
  if (!rows || rows.length === 0) return 0;

  const notifiedIds = await alreadyNotified(supabase, rule.notification_type, rule.name, dataKey, new Date(Date.now() - olderThanHours * 3600000).toISOString());
  const fresh = rows.filter((r: { id: string }) => !notifiedIds.has(r.id));

  let created = 0;
  for (const row of fresh as { id: string }[]) {
    const message = rule.message_template
      .replace(`{{data.${dataKey}}}`, row.id)
      .replace('{{name}}', rule.name);
    const { error } = await supabase.from('notifications').insert({
      type: rule.notification_type,
      title: `Rule: ${rule.name}`,
      message,
      data: { [dataKey]: row.id, rule_id: rule.id, rule_name: rule.name },
      is_read: false,
      is_emailed: false,
      is_webhook_sent: false,
    });
    if (!error) created++;
  }
  return created;
}

async function evaluateStockRule(supabase: SupabaseClient, rule: AlertRule) {
  const category = rule.trigger_condition.category as string | undefined;
  const ruleThreshold = rule.trigger_condition.threshold as number | undefined;

  let productsQuery = supabase.from('products').select('id, name, sku, category, stock, low_stock_threshold');
  if (category) productsQuery = productsQuery.eq('category', category);
  const [{ data: products }, { data: admins }, { data: allSettings }] = await Promise.all([
    productsQuery,
    supabase.from('profiles').select('id').eq('role', 'admin'),
    supabase.from('notification_settings').select('user_id, category_thresholds'),
  ]);

  if (!products || !admins) return 0;

  const settingsByUser = new Map<string, RecipientSettings>((allSettings ?? []).map((s: RecipientSettings) => [s.user_id, s]));
  const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
  let created = 0;

  for (const admin of admins as { id: string }[]) {
    // A recipient's own per-category threshold (set in their Notification
    // Settings) takes priority over the rule's threshold, which in turn beats
    // the product's own low_stock_threshold — so "Stock Thresholds by
    // Category" actually changes who gets notified and when.
    const recipientThresholds = settingsByUser.get(admin.id)?.category_thresholds || {};

    for (const product of products as { id: string; name: string; sku: string; category: string; stock: number; low_stock_threshold: number }[]) {
      const effectiveThreshold = recipientThresholds[product.category] ?? ruleThreshold ?? product.low_stock_threshold;
      if (product.stock > effectiveThreshold) continue;

      const { data: recent } = await supabase
        .from('notifications')
        .select('id')
        .eq('user_id', admin.id)
        .eq('type', rule.notification_type)
        .contains('data', { product_id: product.id })
        .gte('created_at', oneHourAgo)
        .limit(1);
      if (recent && recent.length > 0) continue;

      const title = rule.notification_type === 'out_of_stock' ? `Out of Stock: ${product.name}` : `Low Stock: ${product.name}`;
      const message = `${product.name} (${product.sku}) in ${product.category} has only ${product.stock} units remaining. Threshold: ${effectiveThreshold}.`;
      const { error } = await supabase.from('notifications').insert({
        user_id: admin.id,
        type: rule.notification_type,
        title,
        message,
        data: { product_id: product.id, product_name: product.name, stock: product.stock, rule_id: rule.id },
        is_read: false,
        is_emailed: false,
        is_webhook_sent: false,
      });
      if (!error) created++;
    }
  }
  return created;
}

/** Evaluates every active alert rule and creates notifications for whatever matches. */
export async function evaluateAlertRules(supabase: SupabaseClient) {
  const { data: rules } = await supabase.from('alert_rules').select('*').eq('is_active', true);
  const activeRules = (rules ?? []) as AlertRule[];

  let totalCreated = 0;
  for (const rule of activeRules) {
    try {
      if (rule.trigger_type === 'stock_below_threshold') {
        totalCreated += await evaluateStockRule(supabase, rule);
      } else if (rule.trigger_type === 'order_pending_aging') {
        totalCreated += await evaluateAgingRule(supabase, rule, 'orders', 'order_id', 'pending');
      } else if (rule.trigger_type === 'return_unresolved') {
        totalCreated += await evaluateAgingRule(supabase, rule, 'returns', 'return_id', 'pending');
      } else if (rule.trigger_type === 'transfer_overdue') {
        totalCreated += await evaluateAgingRule(supabase, rule, 'transfers', 'transfer_id', 'requested');
      }
    } catch (err) {
      console.error(`Error evaluating rule ${rule.id}:`, (err as Error).message);
    }
  }

  return { evaluated: activeRules.length, total_created: totalCreated };
}
