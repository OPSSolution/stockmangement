-- ============================================================
-- Stock Management — PostgreSQL Schema (no Supabase)
-- ============================================================

-- CATEGORIES
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  icon TEXT NOT NULL DEFAULT 'ri-folder-line',
  color TEXT NOT NULL DEFAULT '#10b981',
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- SUB-CATEGORIES
CREATE TABLE IF NOT EXISTS sub_categories (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(category_id, name)
);

-- USERS (replaces Supabase auth.users)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ROLES
CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  permissions JSONB NOT NULL DEFAULT '{}',
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- PROFILES
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff',
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- PRODUCTS
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sku TEXT NOT NULL,
  category TEXT NOT NULL,
  warehouse TEXT NOT NULL,
  vendor TEXT,
  image_url TEXT,
  stock INTEGER NOT NULL DEFAULT 0,
  low_stock_threshold INTEGER NOT NULL DEFAULT 10,
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  product_type TEXT NOT NULL DEFAULT 'pack',
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'in_stock' CHECK (status IN ('in_stock', 'low_stock', 'out_of_stock')),
  last_updated TEXT NOT NULL DEFAULT TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI')
);

-- Add columns to existing products table (idempotent)
ALTER TABLE products ADD COLUMN IF NOT EXISTS product_type TEXT NOT NULL DEFAULT 'pack';
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT;

-- SKU must be unique per warehouse, not globally, so the same product can
-- exist as separate stock records in different warehouses (e.g. after a transfer).
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_sku_key;
ALTER TABLE products ADD CONSTRAINT products_sku_warehouse_key UNIQUE (sku, warehouse);

-- STOCK HISTORY
CREATE TABLE IF NOT EXISTS stock_history (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('sale', 'purchase', 'transfer_in', 'transfer_out', 'return', 'adjustment')),
  quantity INTEGER NOT NULL,
  stock_before INTEGER NOT NULL,
  stock_after INTEGER NOT NULL,
  reference TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  warehouse TEXT NOT NULL,
  user_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI')
);

-- WAREHOUSES
CREATE TABLE IF NOT EXISTS warehouses (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('owned', 'vendor')),
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  country TEXT NOT NULL,
  manager TEXT NOT NULL,
  manager_email TEXT,
  manager_phone TEXT,
  operating_hours TEXT,
  total_capacity INTEGER NOT NULL DEFAULT 0,
  used_capacity INTEGER NOT NULL DEFAULT 0,
  total_skus INTEGER NOT NULL DEFAULT 0,
  total_units INTEGER NOT NULL DEFAULT 0,
  inbound_today INTEGER NOT NULL DEFAULT 0,
  outbound_today INTEGER NOT NULL DEFAULT 0,
  pending_pickups INTEGER NOT NULL DEFAULT 0,
  zones JSONB NOT NULL DEFAULT '[]',
  staff JSONB NOT NULL DEFAULT '[]',
  monthly_activity JSONB NOT NULL DEFAULT '[]',
  last_audit TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- VENDORS
CREATE TABLE IF NOT EXISTS vendors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('supplier', 'manufacturer', 'distributor')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  logo TEXT,
  address TEXT,
  city TEXT,
  country TEXT,
  website TEXT,
  registered_at TEXT,
  contacts JSONB NOT NULL DEFAULT '[]',
  products JSONB NOT NULL DEFAULT '[]',
  metrics JSONB NOT NULL DEFAULT '{}',
  tags TEXT[] NOT NULL DEFAULT '{}',
  payment_terms TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- PURCHASES
CREATE TABLE IF NOT EXISTS purchases (
  id TEXT PRIMARY KEY,
  vendor TEXT NOT NULL,
  vendor_contact TEXT,
  vendor_email TEXT,
  warehouse TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('draft','submitted','approved','ordered','received','cancelled')),
  items JSONB NOT NULL DEFAULT '[]',
  total_items INTEGER NOT NULL DEFAULT 0,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  requested_by TEXT NOT NULL,
  approved_by TEXT,
  notes TEXT,
  expected_delivery TEXT,
  received_at TEXT,
  created_at TEXT NOT NULL DEFAULT TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI'),
  updated_at TEXT NOT NULL DEFAULT TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI')
);

-- ORDERS
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  customer TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','partial','processing','fulfilled')),
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  item_count INTEGER NOT NULL DEFAULT 0,
  vendor_splits JSONB NOT NULL DEFAULT '[]',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI'),
  updated_at TEXT NOT NULL DEFAULT TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI')
);

-- DELIVERIES
CREATE TABLE IF NOT EXISTS deliveries (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  customer TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  destination TEXT,
  items INTEGER NOT NULL DEFAULT 0,
  items_detail JSONB NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'prepare' CHECK (status IN ('prepare','ready','in_transit','delivered')),
  carrier TEXT,
  tracking_number TEXT,
  warehouse TEXT,
  estimated_delivery TEXT,
  timeline JSONB NOT NULL DEFAULT '[]',
  last_update TEXT NOT NULL DEFAULT TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Add new columns to existing tables (idempotent for Render re-deploys)
ALTER TABLE products ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';

ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS items_detail JSONB NOT NULL DEFAULT '[]';
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS carrier TEXT;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS tracking_number TEXT;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS warehouse TEXT;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS estimated_delivery TEXT;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS timeline JSONB NOT NULL DEFAULT '[]';

-- TRANSFERS
CREATE TABLE IF NOT EXISTS transfers (
  id TEXT PRIMARY KEY,
  from_warehouse TEXT NOT NULL,
  to_warehouse TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  approved_by TEXT,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','approved','in_transit','received','cancelled')),
  items JSONB NOT NULL DEFAULT '[]',
  total_items INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT '',
  notes TEXT,
  expected_arrival TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI'),
  updated_at TEXT NOT NULL DEFAULT TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI')
);

-- RETURNS
CREATE TABLE IF NOT EXISTS returns (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  customer TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','inspecting','approved','restocked','discarded','refunded','returned')),
  items JSONB NOT NULL DEFAULT '[]',
  total_items INTEGER NOT NULL DEFAULT 0,
  total_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  reason TEXT NOT NULL CHECK (reason IN ('wrong_item','damaged','defective','not_as_described','changed_mind','other')),
  reason_note TEXT,
  refund_method TEXT NOT NULL DEFAULT 'none' CHECK (refund_method IN ('original_payment','store_credit','bank_transfer','none')),
  refund_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  warehouse TEXT NOT NULL,
  assigned_to TEXT,
  inspection_notes TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI'),
  updated_at TEXT NOT NULL DEFAULT TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI')
);

-- REQUIREMENTS
CREATE TABLE IF NOT EXISTS requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  module TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('low','medium','high','critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','done','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- PROMOTIONS
CREATE TABLE IF NOT EXISTS promotions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('percentage','fixed_amount','buy_x_get_y','bundle')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','active','paused','expired')),
  description TEXT,
  discount_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  min_order_amount NUMERIC(12,2),
  max_usage_count INTEGER,
  usage_count INTEGER NOT NULL DEFAULT 0,
  products JSONB NOT NULL DEFAULT '[]',
  bundle_items JSONB,
  bundle_price NUMERIC(12,2),
  buy_qty INTEGER,
  get_qty INTEGER,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  total_revenue NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_units_sold INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI'),
  updated_at TEXT NOT NULL DEFAULT TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI')
);

-- NOTIFICATIONS
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('low_stock','out_of_stock','new_order','return_pending','transfer_ready','delivery_delayed','system')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  data JSONB DEFAULT '{}',
  is_emailed BOOLEAN NOT NULL DEFAULT FALSE,
  is_sms_sent BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- NOTIFICATION SETTINGS
CREATE TABLE IF NOT EXISTS notification_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sms_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  in_app_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  browser_push_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  category_thresholds JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ALERT RULES
CREATE TABLE IF NOT EXISTS alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT NOT NULL,
  trigger_condition JSONB NOT NULL DEFAULT '{}',
  notification_type TEXT NOT NULL,
  message_template TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- PUSH SUBSCRIPTIONS
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT,
  auth TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- WEBHOOK CONFIGS
CREATE TABLE IF NOT EXISTS webhook_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('slack','discord','telegram','custom')),
  webhook_url TEXT NOT NULL,
  secret_token TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  notify_on_types TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ACTIVITY LOG
CREATE TABLE IF NOT EXISTS activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('sale','purchase','transfer','return','adjustment')),
  description TEXT NOT NULL,
  product TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  warehouse TEXT NOT NULL,
  user_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- REPORT TABLES
CREATE TABLE IF NOT EXISTS daily_revenue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date TEXT NOT NULL UNIQUE,
  revenue NUMERIC(12,2) NOT NULL DEFAULT 0,
  orders INTEGER NOT NULL DEFAULT 0,
  returns INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS monthly_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month TEXT NOT NULL UNIQUE,
  revenue NUMERIC(12,2) NOT NULL DEFAULT 0,
  orders INTEGER NOT NULL DEFAULT 0,
  returns INTEGER NOT NULL DEFAULT 0,
  transfers INTEGER NOT NULL DEFAULT 0,
  purchases INTEGER NOT NULL DEFAULT 0,
  avg_order_value NUMERIC(12,2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS top_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id TEXT,
  product_name TEXT NOT NULL,
  sku TEXT NOT NULL,
  category TEXT NOT NULL,
  units_sold INTEGER NOT NULL DEFAULT 0,
  revenue NUMERIC(12,2) NOT NULL DEFAULT 0,
  return_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  trend TEXT NOT NULL DEFAULT 'stable' CHECK (trend IN ('up','down','stable'))
);

CREATE TABLE IF NOT EXISTS category_breakdown (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL UNIQUE,
  revenue NUMERIC(12,2) NOT NULL DEFAULT 0,
  units_sold INTEGER NOT NULL DEFAULT 0,
  return_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  color TEXT NOT NULL DEFAULT '#6b7280'
);

CREATE TABLE IF NOT EXISTS return_reasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reason TEXT NOT NULL UNIQUE,
  count INTEGER NOT NULL DEFAULT 0,
  value NUMERIC(12,2) NOT NULL DEFAULT 0,
  percentage NUMERIC(5,2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS vendor_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor TEXT NOT NULL UNIQUE,
  fulfillment_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  total_orders INTEGER NOT NULL DEFAULT 0,
  rejected_orders INTEGER NOT NULL DEFAULT 0,
  avg_delivery_days NUMERIC(5,2) NOT NULL DEFAULT 0,
  revenue NUMERIC(12,2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS warehouse_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse TEXT NOT NULL UNIQUE,
  inbound INTEGER NOT NULL DEFAULT 0,
  outbound INTEGER NOT NULL DEFAULT 0,
  returns INTEGER NOT NULL DEFAULT 0,
  fulfillment_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  avg_processing_days NUMERIC(5,2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS notification_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day DATE NOT NULL,
  type TEXT NOT NULL,
  total INTEGER NOT NULL DEFAULT 0,
  read_count INTEGER NOT NULL DEFAULT 0,
  emailed_count INTEGER NOT NULL DEFAULT 0,
  sms_count INTEGER NOT NULL DEFAULT 0,
  webhook_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE (day, type)
);
