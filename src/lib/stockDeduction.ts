import { supabase } from './supabase';
import type { ReturnCondition } from '@/mocks/returns';

const GOOD_CONDITIONS: ReturnCondition[] = ['new', 'good', 'fair'];

function deriveStatus(stock: number, threshold: number): 'in_stock' | 'low_stock' | 'out_of_stock' {
  if (stock === 0) return 'out_of_stock';
  if (stock <= threshold) return 'low_stock';
  return 'in_stock';
}

interface DeductLine {
  productId: string;
  quantity: number;
}

/**
 * Physically deducts stock for each line item and logs a stock_history entry —
 * mirrors what Transfers already does on 'received'. Call this only at the moment
 * a request/order is actually confirmed/completed, never at creation and never on
 * reject/cancel, so declined records never touch real stock.
 */
export async function deductStockForItems(
  items: DeductLine[],
  opts: { reference: string; note: string; userName: string; historyType?: 'sale' | 'adjustment' | 'transfer_out' | 'request' }
): Promise<{ error: string | null }> {
  const now = new Date().toISOString();

  for (const item of items) {
    if (!item.productId || !item.quantity) continue;

    const { data: product, error: fetchErr } = await supabase.from('products').select('*').eq('id', item.productId).single();
    if (fetchErr || !product) return { error: fetchErr?.message || `Product ${item.productId} not found` };
    if (product.stock < item.quantity) {
      return { error: `Not enough stock for "${product.name}" — ${product.stock} on hand, ${item.quantity} needed.` };
    }

    const newStock = product.stock - item.quantity;
    const { error: updateErr } = await supabase.from('products').update({
      stock: newStock,
      status: deriveStatus(newStock, product.low_stock_threshold),
      last_updated: now,
    }).eq('id', product.id);
    if (updateErr) return { error: updateErr.message };

    await supabase.from('stock_history').insert({
      id: `SH-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      product_id: product.id,
      type: opts.historyType || 'adjustment',
      quantity: -item.quantity,
      stock_before: product.stock,
      stock_after: newStock,
      reference: opts.reference,
      note: opts.note,
      warehouse: product.warehouse,
      user_name: opts.userName,
      created_at: now,
    });
  }

  return { error: null };
}

interface RestockLine {
  productId: string;
  quantity: number;
  /** New/Good/Fair go back to available stock; Damaged/Defective are still counted as on-hand but placed on hold. Missing condition is treated as good. */
  condition?: ReturnCondition;
  /** Inspection note from the return — carried into the on-hold stock_history entry so Inventory can show *why* it's held. */
  note?: string;
}

/**
 * Physically adds returned stock back onto each product and logs a stock_history
 * entry per item — called when a Return is marked Restocked. Items in good
 * condition go straight into usable stock; damaged/defective items still land in
 * `stock` (so on-hand counts stay accurate) but are also added to `on_hold_stock`,
 * which keeps them out of `availableStock()` until someone resolves the hold.
 */
export async function restockReturnedItems(
  items: RestockLine[],
  opts: { reference: string; userName: string }
): Promise<{ error: string | null }> {
  const now = new Date().toISOString();

  // Group by product so distinct products can be restocked concurrently instead of
  // one sequential fetch+update+insert chain per line — this is the main lever on
  // how long a multi-item return takes to finish. Lines for the *same* product stay
  // sequential within their group so their running stock/on-hold totals stay correct.
  const byProduct = new Map<string, RestockLine[]>();
  items.forEach((item) => {
    if (!item.productId || !item.quantity) return;
    const list = byProduct.get(item.productId);
    if (list) list.push(item);
    else byProduct.set(item.productId, [item]);
  });

  const results = await Promise.all(
    Array.from(byProduct.entries()).map(async ([productId, lines]) => {
      const { data: product, error: fetchErr } = await supabase.from('products').select('*').eq('id', productId).single();
      if (fetchErr || !product) return fetchErr?.message || `Product ${productId} not found`;

      let stock = product.stock;
      let onHold = product.on_hold_stock || 0;

      for (const item of lines) {
        const isGood = !item.condition || GOOD_CONDITIONS.includes(item.condition);
        const stockBefore = stock;
        stock += item.quantity;
        if (!isGood) onHold += item.quantity;

        const { error: insertErr } = await supabase.from('stock_history').insert({
          id: `SH-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          product_id: productId,
          type: 'return',
          quantity: item.quantity,
          stock_before: stockBefore,
          stock_after: stock,
          reference: opts.reference,
          // "On hold — " is a stable prefix Inventory parses back out to show *why* a
          // product's on-hold units can't be used — keep it exact if this note format changes.
          note: isGood
            ? `Returned in ${item.condition || 'good'} condition — added to available stock`
            : `On hold — ${item.note?.trim() || `Returned ${item.condition}, no reason noted`}`,
          warehouse: product.warehouse,
          user_name: opts.userName,
          created_at: now,
        });
        if (insertErr) return insertErr.message;
      }

      const { error: updateErr } = await supabase.from('products').update({
        stock,
        on_hold_stock: onHold,
        status: deriveStatus(stock, product.low_stock_threshold),
        last_updated: now,
      }).eq('id', productId);
      if (updateErr) return updateErr.message;

      return null;
    })
  );

  return { error: results.find((r) => r !== null) ?? null };
}

export type OnHoldResolution = 'release' | 'discard';

interface ResolveOnHoldOptions {
  productId: string;
  quantity: number;
  resolution: OnHoldResolution;
  reference: string;
  userName: string;
  note?: string;
}

/**
 * Clears units out of on_hold_stock — either back into available stock ('release',
 * e.g. inspection found them fine after all) or written off entirely ('discard',
 * removed from stock too). restockReturnedItems is the only place that ever adds to
 * on_hold_stock; this is the only place that ever takes it back down.
 */
export async function resolveOnHoldStock(opts: ResolveOnHoldOptions): Promise<{ error: string | null }> {
  const { productId, quantity, resolution, reference, userName, note } = opts;
  if (!productId || !quantity || quantity <= 0) return { error: 'Quantity must be greater than 0.' };

  const { data: product, error: fetchErr } = await supabase.from('products').select('*').eq('id', productId).single();
  if (fetchErr || !product) return { error: fetchErr?.message || `Product ${productId} not found` };

  const onHold = product.on_hold_stock || 0;
  if (quantity > onHold) return { error: `Only ${onHold} unit(s) on hold — cannot resolve ${quantity}.` };

  const now = new Date().toISOString();
  const newOnHold = onHold - quantity;
  const stockBefore = product.stock;
  const newStock = resolution === 'discard' ? stockBefore - quantity : stockBefore;

  const { error: updateErr } = await supabase.from('products').update({
    stock: newStock,
    on_hold_stock: newOnHold,
    status: deriveStatus(newStock, product.low_stock_threshold),
    last_updated: now,
  }).eq('id', productId);
  if (updateErr) return { error: updateErr.message };

  const label = resolution === 'discard' ? 'Discarded' : 'Released to available stock';
  await supabase.from('stock_history').insert({
    id: `SH-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    product_id: productId,
    type: 'adjustment',
    quantity: resolution === 'discard' ? -quantity : 0,
    stock_before: stockBefore,
    stock_after: newStock,
    reference,
    // "On hold resolved — " is a stable prefix, alongside "On hold — ", that
    // Inventory's On Hold history filter matches so it covers the full lifecycle.
    note: `On hold resolved — ${label}${note ? `: ${note}` : ''}`,
    warehouse: product.warehouse,
    user_name: userName,
    created_at: now,
  });

  return { error: null };
}

interface MoveLine {
  productId: string;
  quantity: number;
}

/**
 * Moves stock from the source warehouse's product into the destination warehouse's
 * matching product (matched by SKU) — creating it there if it doesn't exist yet —
 * and logs both sides to stock_history. Shared by Transfers (on 'received') and
 * Deliveries (on 'delivered'), which represent the same physical movement.
 */
export async function moveStockBetweenWarehouses(
  items: MoveLine[],
  opts: { fromWarehouse: string; toWarehouse: string; reference: string; userName: string }
): Promise<{ error: string | null }> {
  const now = new Date().toISOString();

  const { data: allProducts, error: fetchErr } = await supabase.from('products').select('*');
  if (fetchErr || !allProducts) return { error: fetchErr?.message || 'Failed to load products' };

  let maxNum = allProducts.length > 0
    ? Math.max(...allProducts.map((p) => parseInt(String(p.id).replace('P', '')) || 0))
    : 0;

  for (const item of items) {
    if (!item.productId || !item.quantity) continue;
    const sourceProduct = allProducts.find((p) => p.id === item.productId);
    if (!sourceProduct) continue;
    if (sourceProduct.stock < item.quantity) {
      return { error: `Not enough stock for "${sourceProduct.name}" — ${sourceProduct.stock} on hand, ${item.quantity} needed.` };
    }

    const newSourceStock = sourceProduct.stock - item.quantity;
    const { error: srcErr } = await supabase.from('products').update({
      stock: newSourceStock,
      status: deriveStatus(newSourceStock, sourceProduct.low_stock_threshold),
      last_updated: now,
    }).eq('id', sourceProduct.id);
    if (srcErr) return { error: srcErr.message };

    await supabase.from('stock_history').insert({
      id: `SH-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      product_id: sourceProduct.id,
      type: 'transfer_out',
      quantity: -item.quantity,
      stock_before: sourceProduct.stock,
      stock_after: newSourceStock,
      reference: opts.reference,
      note: `Transferred to ${opts.toWarehouse}`,
      warehouse: sourceProduct.warehouse,
      user_name: opts.userName,
      created_at: now,
    });
    sourceProduct.stock = newSourceStock;

    const destProduct = allProducts.find((p) => p.warehouse === opts.toWarehouse && p.sku === sourceProduct.sku);

    if (destProduct) {
      const newDestStock = destProduct.stock + item.quantity;
      const { error: destErr } = await supabase.from('products').update({
        stock: newDestStock,
        status: deriveStatus(newDestStock, destProduct.low_stock_threshold),
        last_updated: now,
      }).eq('id', destProduct.id);
      if (destErr) return { error: destErr.message };

      await supabase.from('stock_history').insert({
        id: `SH-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        product_id: destProduct.id,
        type: 'transfer_in',
        quantity: item.quantity,
        stock_before: destProduct.stock,
        stock_after: newDestStock,
        reference: opts.reference,
        note: `Transferred from ${opts.fromWarehouse}`,
        warehouse: destProduct.warehouse,
        user_name: opts.userName,
        created_at: now,
      });
      destProduct.stock = newDestStock;
    } else {
      maxNum += 1;
      const newId = `P${String(maxNum).padStart(3, '0')}`;
      const { error: createErr } = await supabase.from('products').insert({
        id: newId,
        name: sourceProduct.name,
        sku: sourceProduct.sku,
        category: sourceProduct.category,
        warehouse: opts.toWarehouse,
        vendor: sourceProduct.vendor || null,
        image_url: sourceProduct.image_url || null,
        stock: item.quantity,
        low_stock_threshold: sourceProduct.low_stock_threshold,
        price: sourceProduct.price,
        product_type: sourceProduct.product_type,
        status: deriveStatus(item.quantity, sourceProduct.low_stock_threshold),
        last_updated: now,
      });
      if (createErr) return { error: createErr.message };

      await supabase.from('stock_history').insert({
        id: `SH-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        product_id: newId,
        type: 'transfer_in',
        quantity: item.quantity,
        stock_before: 0,
        stock_after: item.quantity,
        reference: opts.reference,
        note: `Transferred from ${opts.fromWarehouse} — new product added to ${opts.toWarehouse}`,
        warehouse: opts.toWarehouse,
        user_name: opts.userName,
        created_at: now,
      });

      allProducts.push({ ...sourceProduct, id: newId, warehouse: opts.toWarehouse, stock: item.quantity });
    }
  }

  return { error: null };
}
