import type { SupabaseClient } from '@supabase/supabase-js';

interface ProductRow {
  id: string;
  name: string;
  sku: string;
  category: string;
  stock: number;
  low_stock_threshold: number;
  warehouse: string;
}

interface SettingsRow {
  user_id: string;
  category_thresholds: Record<string, number>;
}

/**
 * Checks every product against every user's effective threshold (their own
 * per-category override from Notification Settings, falling back to the
 * product's own low_stock_threshold) and notifies them directly — this is
 * the baseline stock alert, always on, and doesn't require an admin to set
 * up an Alert Rule first. Every user gets these (unlike new_request/
 * new_order/new_delivery/new_transfer, which are admin-only).
 */
export async function checkStockAlerts(supabase: SupabaseClient) {
  const [{ data: stockRows }, { data: users }, { data: allSettings }] = await Promise.all([
    supabase.from('product_warehouse_stock').select('warehouse, stock, low_stock_threshold, product:products(id, name, sku, category)'),
    supabase.from('profiles').select('id'),
    supabase.from('notification_settings').select('user_id, category_thresholds'),
  ]);

  const products: ProductRow[] = (stockRows ?? [])
    .filter((row: any) => row.product)
    .map((row: any) => ({
      id: row.product.id,
      name: row.product.name,
      sku: row.product.sku,
      category: row.product.category,
      stock: row.stock,
      low_stock_threshold: row.low_stock_threshold,
      warehouse: row.warehouse,
    }));

  if (!products || !users || products.length === 0 || users.length === 0) return { created: 0 };

  const settingsByUser = new Map<string, SettingsRow>((allSettings ?? []).map((s: SettingsRow) => [s.user_id, s]));
  const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
  let created = 0;

  for (const user of users as { id: string }[]) {
    const recipientThresholds = settingsByUser.get(user.id)?.category_thresholds || {};

    for (const product of products as ProductRow[]) {
      const effectiveThreshold = recipientThresholds[product.category] ?? product.low_stock_threshold;
      const type = product.stock <= 0 ? 'out_of_stock' : product.stock <= effectiveThreshold ? 'low_stock' : null;
      if (!type) continue;

      const { data: recent } = await supabase
        .from('notifications')
        .select('id')
        .eq('user_id', user.id)
        .eq('type', type)
        .contains('data', { product_id: product.id, warehouse: product.warehouse })
        .gte('created_at', oneHourAgo)
        .limit(1);
      if (recent && recent.length > 0) continue;

      const title = type === 'out_of_stock' ? `Out of Stock: ${product.name}` : `Low Stock: ${product.name}`;
      const message = type === 'out_of_stock'
        ? `${product.name} (${product.sku}) is out of stock at ${product.warehouse}.`
        : `${product.name} (${product.sku}) in ${product.category} has only ${product.stock} units remaining at ${product.warehouse}. Threshold: ${effectiveThreshold}.`;

      const { error } = await supabase.from('notifications').insert({
        user_id: user.id,
        type,
        title,
        message,
        data: { product_id: product.id, product_name: product.name, stock: product.stock, warehouse: product.warehouse },
        is_read: false,
        is_emailed: false,
        is_webhook_sent: false,
      });
      if (!error) created++;
    }
  }

  return { created };
}
