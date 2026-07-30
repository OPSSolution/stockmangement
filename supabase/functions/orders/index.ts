// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const jsonResponse = (status, body, extra = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
      ...extra,
    },
  });

// Deno Deploy runs in UTC, so this is still a UTC clock, but at least it's no
// longer generated via toISOString().slice() — which silently produced a UTC
// reading disguised as a local one wherever it got compared against genuinely
// local browser timestamps from the same "YYYY-MM-DD HH:mm" columns.
const nowStamp = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const buildVendorSplits = (selectedLines) => {
  const grouped = new Map();

  selectedLines.forEach((line) => {
    const vendor = line.product.vendor || line.product.warehouse;
    if (!grouped.has(vendor)) grouped.set(vendor, []);
    grouped.get(vendor).push(line);
  });

  return Array.from(grouped.entries()).map(([vendor, lines], splitIndex) => ({
    vendor,
    warehouse: lines[0].product.warehouse,
    status: 'pending',
    subtotal: lines.reduce((sum, line) => sum + line.quantity * line.product.price, 0),
    items: lines.map((line, itemIndex) => ({
      id: `OI-${Date.now()}-${splitIndex}-${itemIndex}`,
      productId: line.product.id,
      productName: line.product.name,
      sku: line.product.sku,
      quantity: line.quantity,
      unitPrice: line.product.price,
      availableQty: line.product.stock,
      vendor,
      warehouse: line.product.warehouse,
      status: 'pending',
    })),
  }));
};

const buildOrderPayload = (draft, products) => {
  const selectedLines = draft.lines
    .map((line) => ({
      ...line,
      quantity: Number(line.quantity) || 0,
      product: products.find((p) => p.id === line.productId),
    }))
    .filter((line) => Boolean(line.product) && line.quantity > 0);

  const itemCount = selectedLines.reduce((sum, line) => sum + line.quantity, 0);
  const total = selectedLines.reduce((sum, line) => sum + line.quantity * line.product.price, 0);
  const timestamp = nowStamp();

  return {
    id: `ORD-${Date.now()}`,
    requested_by: draft.requestedBy?.trim() || null,
    customer: draft.customer?.trim(),
    email: draft.email?.trim(),
    phone: draft.phone?.trim(),
    address: draft.address?.trim(),
    city: draft.city?.trim(),
    created_at: timestamp,
    updated_at: timestamp,
    status: 'pending',
    total,
    item_count: itemCount,
    vendor_splits: buildVendorSplits(selectedLines),
    notes: draft.notes?.trim() || null,
  };
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceKey) {
      return jsonResponse(500, { error: 'Missing Supabase environment variables' });
    }

    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const method = req.method.toUpperCase();
    const body = method === 'GET' ? {} : await req.json().catch(() => ({}));

    if (method === 'GET') {
      const { data: orders, error } = await adminClient
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        return jsonResponse(400, { error: error.message });
      }

      return jsonResponse(200, { orders: orders || [] });
    }

    if (method === 'POST') {
      if (body.action === 'create') {
        const { draft } = body;
        if (!draft || !draft.customer || !draft.email || !draft.phone || !draft.address || !draft.city) {
          return jsonResponse(400, { error: 'Missing required order fields' });
        }

        const { data: stockRows, error: productsError } = await adminClient
          .from('product_warehouse_stock')
          .select('*, product:products(*)');

        if (productsError) {
          return jsonResponse(400, { error: productsError.message });
        }

        // A customer order line only names a productId, not a warehouse — fulfillment
        // auto-picks whichever warehouse currently has the most stock of that product.
        const bestByProduct = new Map();
        (stockRows || []).filter((row) => row.product).forEach((row) => {
          const flat = {
            id: row.product.id,
            name: row.product.name,
            sku: row.product.sku,
            price: row.product.price,
            vendor: row.vendor,
            warehouse: row.warehouse,
            stock: row.stock,
          };
          const existing = bestByProduct.get(flat.id);
          if (!existing || flat.stock > existing.stock) bestByProduct.set(flat.id, flat);
        });

        const payload = buildOrderPayload(draft, Array.from(bestByProduct.values()));
        const { data, error } = await adminClient.from('orders').insert(payload).select('*').single();

        if (error) {
          return jsonResponse(400, { error: error.message });
        }

        return jsonResponse(200, { order: data });
      }

      return jsonResponse(400, { error: 'Unsupported POST action' });
    }

    if (method === 'PATCH') {
      if (body.action === 'update') {
        const { id, updates } = body;
        if (!id) {
          return jsonResponse(400, { error: 'Order id is required' });
        }

        const { data, error } = await adminClient
          .from('orders')
          .update(updates || {})
          .eq('id', id)
          .select('*')
          .single();

        if (error) {
          return jsonResponse(400, { error: error.message });
        }

        return jsonResponse(200, { order: data });
      }

      return jsonResponse(400, { error: 'Unsupported PATCH action' });
    }

    if (method === 'DELETE') {
      const { id } = body;
      if (!id) {
        return jsonResponse(400, { error: 'Order id is required' });
      }

      const { error } = await adminClient.from('orders').delete().eq('id', id);
      if (error) {
        return jsonResponse(400, { error: error.message });
      }

      return jsonResponse(200, { success: true, id });
    }

    return jsonResponse(405, { error: 'Method not allowed' });
  } catch (err) {
    return jsonResponse(500, { error: (err instanceof Error ? err.message : 'Unexpected error') });
  }
});
