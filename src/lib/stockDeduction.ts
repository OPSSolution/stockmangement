import { supabase } from './supabase';
import type { ReturnCondition } from '@/mocks/returns';

const GOOD_CONDITIONS: ReturnCondition[] = ['new', 'good', 'fair'];

function deriveStatus(stock: number, threshold: number): 'in_stock' | 'low_stock' | 'out_of_stock' {
  if (stock === 0) return 'out_of_stock';
  if (stock <= threshold) return 'low_stock';
  return 'in_stock';
}

/** A product's stock record at one specific warehouse — every stock-moving function
 * below operates on this, not on `products` directly, since a product can now have
 * stock (and no single "the" warehouse) at more than one warehouse at once. */
async function fetchStockRow(productId: string, warehouse: string) {
  return supabase
    .from('product_warehouse_stock')
    .select('*, product:products(name)')
    .eq('product_id', productId)
    .eq('warehouse', warehouse)
    .maybeSingle();
}

/**
 * Applies `delta` to one bin's share of a product's stock at a specific warehouse —
 * positive to add (received, restocked, transferred in), negative to remove (sold,
 * dispatched, transferred out). Every stock-moving function below routes through this
 * so a product's product_bin_stock rows stay in sync with the bin actually picked in
 * the UI, not just the product_warehouse_stock's aggregate `stock` column. No-ops when
 * no bin was picked (e.g. the product isn't split across bins, or the transaction
 * doesn't yet know where the stock is landing).
 *
 * `expiryDate` only applies on incoming stock (delta > 0) — the bin's tracked
 * expiry is overwritten with the newly-arrived batch's date, since a single bin
 * doesn't track more than one batch's expiry at a time.
 */
export async function adjustBinQuantity(productId: string, warehouse: string, binLocation: string | undefined | null, delta: number, expiryDate?: string | null) {
  if (!binLocation || delta === 0) return;
  const { data: row } = await supabase
    .from('product_bin_stock')
    .select('id, quantity')
    .eq('product_id', productId)
    .eq('warehouse', warehouse)
    .eq('bin_location', binLocation)
    .maybeSingle();
  if (row) {
    const newQty = Math.max(0, (row.quantity as number) + delta);
    const update: Record<string, unknown> = { quantity: newQty };
    if (delta > 0 && expiryDate) update.expiry_date = expiryDate;
    await supabase.from('product_bin_stock').update(update).eq('id', row.id as string);
  } else if (delta > 0) {
    await supabase.from('product_bin_stock').insert({
      id: `PBS-${productId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      product_id: productId,
      warehouse,
      bin_location: binLocation,
      quantity: delta,
      expiry_date: expiryDate || null,
    });
  }
}

interface DeductLine {
  productId: string;
  warehouse: string;
  quantity: number;
  /** Which bin the units are coming out of — omit if the product isn't bin-split or the bin isn't known. */
  binLocation?: string;
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
    if (!item.productId || !item.warehouse || !item.quantity) continue;

    const { data: row, error: fetchErr } = await fetchStockRow(item.productId, item.warehouse);
    if (fetchErr || !row) return { error: fetchErr?.message || `Product ${item.productId} not stocked at ${item.warehouse}` };
    if (row.stock < item.quantity) {
      const name = row.product?.name ?? item.productId;
      const short = item.quantity - row.stock;
      return { error: `Not enough "${name}" in stock. You need ${item.quantity} but only ${row.stock} ${row.stock === 1 ? 'is' : 'are'} available (short by ${short}). Restock or lower the quantity and try again.` };
    }

    const newStock = row.stock - item.quantity;
    const { error: updateErr } = await supabase.from('product_warehouse_stock').update({
      stock: newStock,
      status: deriveStatus(newStock, row.low_stock_threshold),
      last_updated: now,
    }).eq('id', row.id);
    if (updateErr) return { error: updateErr.message };

    await supabase.from('stock_history').insert({
      id: `SH-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      product_id: item.productId,
      type: opts.historyType || 'adjustment',
      quantity: -item.quantity,
      stock_before: row.stock,
      stock_after: newStock,
      reference: opts.reference,
      note: opts.note,
      warehouse: item.warehouse,
      user_name: opts.userName,
      created_at: now,
      bin_location: item.binLocation || null,
    });
    await adjustBinQuantity(item.productId, item.warehouse, item.binLocation, -item.quantity);
  }

  return { error: null };
}

interface RestockLine {
  productId: string;
  warehouse: string;
  quantity: number;
  /** New/Good/Fair go back to available stock; Damaged/Defective are still counted as on-hand but placed on hold. Missing condition is treated as good. */
  condition?: ReturnCondition;
  /** Inspection note from the return — carried into the on-hold stock_history entry so Inventory can show *why* it's held. */
  note?: string;
  /** Which bin the returned units are being put away into — omit if not yet decided. */
  binLocation?: string;
}

/**
 * Physically adds returned stock back onto each product's warehouse stock and logs a
 * stock_history entry per item — called when a Return is marked Restocked. Items in
 * good condition go straight into usable stock; damaged/defective items still land in
 * `stock` (so on-hand counts stay accurate) but are also added to `on_hold_stock`,
 * which keeps them out of `availableStock()` until someone resolves the hold.
 */
export async function restockReturnedItems(
  items: RestockLine[],
  opts: { reference: string; userName: string }
): Promise<{ error: string | null }> {
  const now = new Date().toISOString();

  // Group by (product, warehouse) so distinct stock rows can be restocked concurrently
  // instead of one sequential fetch+update+insert chain per line — this is the main
  // lever on how long a multi-item return takes to finish. Lines for the *same* stock
  // row stay sequential within their group so their running totals stay correct.
  const byRow = new Map<string, { productId: string; warehouse: string; lines: RestockLine[] }>();
  items.forEach((item) => {
    if (!item.productId || !item.warehouse || !item.quantity) return;
    const key = `${item.productId}::${item.warehouse}`;
    const entry = byRow.get(key);
    if (entry) entry.lines.push(item);
    else byRow.set(key, { productId: item.productId, warehouse: item.warehouse, lines: [item] });
  });

  const results = await Promise.all(
    Array.from(byRow.values()).map(async ({ productId, warehouse, lines }) => {
      const { data: row, error: fetchErr } = await fetchStockRow(productId, warehouse);
      if (fetchErr || !row) return fetchErr?.message || `Product ${productId} not stocked at ${warehouse}`;

      let stock = row.stock;
      let onHold = row.on_hold_stock || 0;

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
          warehouse,
          user_name: opts.userName,
          created_at: now,
          bin_location: item.binLocation || null,
        });
        if (insertErr) return insertErr.message;
        await adjustBinQuantity(productId, warehouse, item.binLocation, item.quantity);
      }

      const { error: updateErr } = await supabase.from('product_warehouse_stock').update({
        stock,
        on_hold_stock: onHold,
        status: deriveStatus(stock, row.low_stock_threshold),
        last_updated: now,
      }).eq('id', row.id);
      if (updateErr) return updateErr.message;

      return null;
    })
  );

  return { error: results.find((r) => r !== null) ?? null };
}

interface ReceiveLine {
  productId: string;
  warehouse: string;
  quantity: number;
  /** Which bin the received units are being put away into — omit if not yet decided. */
  binLocation?: string;
}

/**
 * Physically adds received purchase-order stock onto each product's warehouse stock
 * and logs a stock_history entry per item — called when a Purchase Order is marked
 * Received. Mirrors restockReturnedItems but for inbound POs instead of customer returns.
 */
export async function receivePurchaseOrderItems(
  items: ReceiveLine[],
  opts: { reference: string; userName: string }
): Promise<{ error: string | null }> {
  const now = new Date().toISOString();

  for (const item of items) {
    if (!item.productId || !item.warehouse || !item.quantity) continue;

    const { data: row, error: fetchErr } = await fetchStockRow(item.productId, item.warehouse);
    if (fetchErr || !row) return { error: fetchErr?.message || `Product ${item.productId} not stocked at ${item.warehouse}` };

    const newStock = row.stock + item.quantity;
    const { error: updateErr } = await supabase.from('product_warehouse_stock').update({
      stock: newStock,
      status: deriveStatus(newStock, row.low_stock_threshold),
      last_updated: now,
    }).eq('id', row.id);
    if (updateErr) return { error: updateErr.message };

    await supabase.from('stock_history').insert({
      id: `SH-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      product_id: item.productId,
      type: 'purchase',
      quantity: item.quantity,
      stock_before: row.stock,
      stock_after: newStock,
      reference: opts.reference,
      note: `Purchase order ${opts.reference} received`,
      warehouse: item.warehouse,
      user_name: opts.userName,
      created_at: now,
      bin_location: item.binLocation || null,
    });
    await adjustBinQuantity(item.productId, item.warehouse, item.binLocation, item.quantity);
  }

  return { error: null };
}

interface StockReceiveLine {
  productId: string;
  warehouse: string;
  quantity: number;
  /** Any bin in the warehouse — not necessarily one the product already sits in. */
  binLocation?: string;
  /** Expiry of the batch received into that bin, if tracked. */
  expiryDate?: string;
}

/**
 * Physically adds stock from a standalone Stock Receive (no purchase order behind
 * it) onto each product's warehouse stock, updates the destination bin's quantity
 * and expiry, and logs a stock_history entry per item. Unlike receivePurchaseOrderItems,
 * this also recomputes that warehouse's nearest-expiry summary from its bins
 * afterward, since a receive is often the thing that introduces or changes a bin's
 * expiry date.
 */
export async function receiveStockItems(
  items: StockReceiveLine[],
  opts: { reference: string; userName: string; note?: string }
): Promise<{ error: string | null }> {
  const now = new Date().toISOString();

  for (const item of items) {
    if (!item.productId || !item.warehouse || !item.quantity) continue;

    const { data: row, error: fetchErr } = await fetchStockRow(item.productId, item.warehouse);
    if (fetchErr || !row) return { error: fetchErr?.message || `Product ${item.productId} not stocked at ${item.warehouse}` };

    const newStock = row.stock + item.quantity;
    await adjustBinQuantity(item.productId, item.warehouse, item.binLocation, item.quantity, item.expiryDate);

    // Nearest-expiry-across-bins is the per-warehouse summary shown elsewhere (table
    // badges, low-stock lists) — recompute it from this warehouse's bins as they now
    // stand rather than just trusting whatever this one line brought in. Scoped to
    // this warehouse only — a product's bins in other warehouses are irrelevant here.
    let newExpiryDate: string | null = row.expiry_date || null;
    if (item.binLocation) {
      const { data: bins } = await supabase.from('product_bin_stock').select('expiry_date').eq('product_id', item.productId).eq('warehouse', item.warehouse);
      const valid = (bins || []).map((b) => b.expiry_date as string | null).filter((d): d is string => Boolean(d));
      newExpiryDate = valid.length > 0 ? valid.reduce((min, d) => (d < min ? d : min)) : newExpiryDate;
    } else if (item.expiryDate) {
      newExpiryDate = item.expiryDate;
    }

    const { error: updateErr } = await supabase.from('product_warehouse_stock').update({
      stock: newStock,
      status: deriveStatus(newStock, row.low_stock_threshold),
      expiry_date: newExpiryDate,
      last_updated: now,
    }).eq('id', row.id);
    if (updateErr) return { error: updateErr.message };

    await supabase.from('stock_history').insert({
      id: `SH-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      product_id: item.productId,
      type: 'purchase',
      quantity: item.quantity,
      stock_before: row.stock,
      stock_after: newStock,
      reference: opts.reference,
      note: opts.note || `Stock receive ${opts.reference}`,
      warehouse: item.warehouse,
      user_name: opts.userName,
      created_at: now,
      expiry_date: item.expiryDate || null,
      bin_location: item.binLocation || null,
    });
  }

  return { error: null };
}

export type OnHoldResolution = 'release' | 'discard';

interface ResolveOnHoldOptions {
  productId: string;
  warehouse: string;
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
  const { productId, warehouse, quantity, resolution, reference, userName, note } = opts;
  if (!productId || !warehouse || !quantity || quantity <= 0) return { error: 'Quantity must be greater than 0.' };

  const { data: row, error: fetchErr } = await fetchStockRow(productId, warehouse);
  if (fetchErr || !row) return { error: fetchErr?.message || `Product ${productId} not stocked at ${warehouse}` };

  const onHold = row.on_hold_stock || 0;
  if (quantity > onHold) return { error: `Only ${onHold} unit(s) on hold — cannot resolve ${quantity}.` };

  const now = new Date().toISOString();
  const newOnHold = onHold - quantity;
  const stockBefore = row.stock;
  const newStock = resolution === 'discard' ? stockBefore - quantity : stockBefore;

  const { error: updateErr } = await supabase.from('product_warehouse_stock').update({
    stock: newStock,
    on_hold_stock: newOnHold,
    status: deriveStatus(newStock, row.low_stock_threshold),
    last_updated: now,
  }).eq('id', row.id);
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
    warehouse,
    user_name: userName,
    created_at: now,
  });

  return { error: null };
}

interface MoveLine {
  productId: string;
  quantity: number;
  /** Which bin at the source warehouse the units are leaving from — omit if not known. */
  fromBinLocation?: string;
  /** Which bin at the destination warehouse the units are landing in — omit if not yet decided. */
  toBinLocation?: string;
}

/**
 * Moves stock from the source warehouse's stock record into the destination
 * warehouse's stock record for the *same* product — creating that record there if
 * this is the first time the product has ever been stocked at that warehouse — and
 * logs both sides to stock_history. Shared by Transfers (on 'received') and
 * Deliveries (on 'delivered'), which represent the same physical movement.
 *
 * Unlike the old per-warehouse-product-row model, this never creates a new
 * `products` row — a product is one master record everywhere; only its
 * product_warehouse_stock rows multiply as it reaches new warehouses.
 */
export async function moveStockBetweenWarehouses(
  items: MoveLine[],
  opts: { fromWarehouse: string; toWarehouse: string; reference: string; userName: string }
): Promise<{ error: string | null }> {
  const now = new Date().toISOString();

  for (const item of items) {
    if (!item.productId || !item.quantity) continue;

    const { data: sourceRow, error: srcFetchErr } = await fetchStockRow(item.productId, opts.fromWarehouse);
    if (srcFetchErr) return { error: srcFetchErr.message };
    if (!sourceRow) return { error: `Product not stocked at ${opts.fromWarehouse}.` };
    if (sourceRow.stock < item.quantity) {
      const name = sourceRow.product?.name ?? item.productId;
      const short = item.quantity - sourceRow.stock;
      return { error: `Not enough "${name}" in stock at ${opts.fromWarehouse}. You need ${item.quantity} but only ${sourceRow.stock} ${sourceRow.stock === 1 ? 'is' : 'are'} available (short by ${short}). Restock or lower the quantity and try again.` };
    }

    const newSourceStock = sourceRow.stock - item.quantity;
    const { error: srcErr } = await supabase.from('product_warehouse_stock').update({
      stock: newSourceStock,
      status: deriveStatus(newSourceStock, sourceRow.low_stock_threshold),
      last_updated: now,
    }).eq('id', sourceRow.id);
    if (srcErr) return { error: srcErr.message };

    await supabase.from('stock_history').insert({
      id: `SH-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      product_id: item.productId,
      type: 'transfer_out',
      quantity: -item.quantity,
      stock_before: sourceRow.stock,
      stock_after: newSourceStock,
      reference: opts.reference,
      note: `Transferred to ${opts.toWarehouse}`,
      warehouse: opts.fromWarehouse,
      user_name: opts.userName,
      created_at: now,
      bin_location: item.fromBinLocation || null,
    });
    await adjustBinQuantity(item.productId, opts.fromWarehouse, item.fromBinLocation, -item.quantity);

    // Find-or-create the destination warehouse's stock record for this product. This
    // is the replacement for the old "clone the whole product into a brand-new
    // products row with a new id" behavior — the master product is shared across
    // warehouses now, so a SKU landing at a warehouse for the first time only ever
    // needs a new product_warehouse_stock row (+ its bins), never a new product.
    const { data: destRow, error: destFetchErr } = await fetchStockRow(item.productId, opts.toWarehouse);
    if (destFetchErr) return { error: destFetchErr.message };

    if (destRow) {
      const newDestStock = destRow.stock + item.quantity;
      const { error: destErr } = await supabase.from('product_warehouse_stock').update({
        stock: newDestStock,
        status: deriveStatus(newDestStock, destRow.low_stock_threshold),
        last_updated: now,
      }).eq('id', destRow.id);
      if (destErr) return { error: destErr.message };

      await supabase.from('stock_history').insert({
        id: `SH-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        product_id: item.productId,
        type: 'transfer_in',
        quantity: item.quantity,
        stock_before: destRow.stock,
        stock_after: newDestStock,
        reference: opts.reference,
        note: `Transferred from ${opts.fromWarehouse}`,
        warehouse: opts.toWarehouse,
        user_name: opts.userName,
        created_at: now,
        bin_location: item.toBinLocation || null,
      });
      await adjustBinQuantity(item.productId, opts.toWarehouse, item.toBinLocation, item.quantity);
    } else {
      const { error: createErr } = await supabase.from('product_warehouse_stock').insert({
        id: `PWS-${item.productId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        product_id: item.productId,
        warehouse: opts.toWarehouse,
        stock: item.quantity,
        on_hold_stock: 0,
        low_stock_threshold: sourceRow.low_stock_threshold,
        status: deriveStatus(item.quantity, sourceRow.low_stock_threshold),
        last_updated: now,
      });
      if (createErr) return { error: createErr.message };

      await supabase.from('stock_history').insert({
        id: `SH-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        product_id: item.productId,
        type: 'transfer_in',
        quantity: item.quantity,
        stock_before: 0,
        stock_after: item.quantity,
        reference: opts.reference,
        note: `Transferred from ${opts.fromWarehouse} — first stock of this product at ${opts.toWarehouse}`,
        warehouse: opts.toWarehouse,
        user_name: opts.userName,
        created_at: now,
        bin_location: item.toBinLocation || null,
      });
      await adjustBinQuantity(item.productId, opts.toWarehouse, item.toBinLocation, item.quantity);
    }
  }

  return { error: null };
}
