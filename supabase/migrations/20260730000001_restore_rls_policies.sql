-- ============================================================
-- Emergency restore: RLS was enabled on these tables (via the dashboard's
-- "Unrestricted" toggle) without confirming their original policies still
-- existed underneath, which defaults every table to deny-all — breaking
-- reads/writes across most of the app. This recreates each policy exactly
-- as originally defined in 20260608000000_initial_schema.sql. Safe to run
-- any number of times (DROP POLICY IF EXISTS before each CREATE POLICY).
--
-- profiles.id / user_id columns turned out to be `text` in the live database
-- (not `uuid` as the original migration assumed — the schema drifted since),
-- so every auth.uid() comparison is cast to text on both sides to work
-- regardless of the actual column type.
-- ============================================================

drop policy if exists "Authenticated users can read products" on public.products;
create policy "Authenticated users can read products" on public.products for select using (auth.role() = 'authenticated');
drop policy if exists "Staff and admin can modify products" on public.products;
create policy "Staff and admin can modify products" on public.products for all using (
  exists (select 1 from public.profiles p where p.id::text = auth.uid()::text and p.role in ('admin', 'staff'))
);

drop policy if exists "Authenticated users can read warehouses" on public.warehouses;
create policy "Authenticated users can read warehouses" on public.warehouses for select using (auth.role() = 'authenticated');
drop policy if exists "Admin can modify warehouses" on public.warehouses;
create policy "Admin can modify warehouses" on public.warehouses for all using (
  exists (select 1 from public.profiles p where p.id::text = auth.uid()::text and p.role = 'admin')
);

drop policy if exists "Authenticated users can read vendors" on public.vendors;
create policy "Authenticated users can read vendors" on public.vendors for select using (auth.role() = 'authenticated');
drop policy if exists "Staff and admin can modify vendors" on public.vendors;
create policy "Staff and admin can modify vendors" on public.vendors for all using (
  exists (select 1 from public.profiles p where p.id::text = auth.uid()::text and p.role in ('admin', 'staff'))
);

drop policy if exists "Authenticated users can read orders" on public.orders;
create policy "Authenticated users can read orders" on public.orders for select using (auth.role() = 'authenticated');
drop policy if exists "Staff and admin can modify orders" on public.orders;
create policy "Staff and admin can modify orders" on public.orders for all using (
  exists (select 1 from public.profiles p where p.id::text = auth.uid()::text and p.role in ('admin', 'staff'))
);

drop policy if exists "Authenticated users can read deliveries" on public.deliveries;
create policy "Authenticated users can read deliveries" on public.deliveries for select using (auth.role() = 'authenticated');
drop policy if exists "Staff and admin can modify deliveries" on public.deliveries;
create policy "Staff and admin can modify deliveries" on public.deliveries for all using (
  exists (select 1 from public.profiles p where p.id::text = auth.uid()::text and p.role in ('admin', 'staff'))
);

drop policy if exists "Authenticated users can read transfers" on public.transfers;
create policy "Authenticated users can read transfers" on public.transfers for select using (auth.role() = 'authenticated');
drop policy if exists "Staff and admin can modify transfers" on public.transfers;
create policy "Staff and admin can modify transfers" on public.transfers for all using (
  exists (select 1 from public.profiles p where p.id::text = auth.uid()::text and p.role in ('admin', 'staff'))
);

drop policy if exists "Authenticated users can read returns" on public.returns;
create policy "Authenticated users can read returns" on public.returns for select using (auth.role() = 'authenticated');
drop policy if exists "Staff and admin can modify returns" on public.returns;
create policy "Staff and admin can modify returns" on public.returns for all using (
  exists (select 1 from public.profiles p where p.id::text = auth.uid()::text and p.role in ('admin', 'staff'))
);

drop policy if exists "Authenticated users can read requirements" on public.requirements;
create policy "Authenticated users can read requirements" on public.requirements for select using (auth.role() = 'authenticated');
drop policy if exists "Admin can modify requirements" on public.requirements;
create policy "Admin can modify requirements" on public.requirements for all using (
  exists (select 1 from public.profiles p where p.id::text = auth.uid()::text and p.role = 'admin')
);

drop policy if exists "Authenticated users can read promotions" on public.promotions;
create policy "Authenticated users can read promotions" on public.promotions for select using (auth.role() = 'authenticated');
drop policy if exists "Admin can modify promotions" on public.promotions;
create policy "Admin can modify promotions" on public.promotions for all using (
  exists (select 1 from public.profiles p where p.id::text = auth.uid()::text and p.role = 'admin')
);

drop policy if exists "Users can read own notifications" on public.notifications;
create policy "Users can read own notifications" on public.notifications for select using (user_id::text = auth.uid()::text);
drop policy if exists "Users can update own notifications" on public.notifications;
create policy "Users can update own notifications" on public.notifications for update using (user_id::text = auth.uid()::text);
drop policy if exists "Users can delete own notifications" on public.notifications;
create policy "Users can delete own notifications" on public.notifications for delete using (user_id::text = auth.uid()::text);
drop policy if exists "Service role can insert notifications" on public.notifications;
create policy "Service role can insert notifications" on public.notifications for insert with check (true);

drop policy if exists "Authenticated users can read alert rules" on public.alert_rules;
create policy "Authenticated users can read alert rules" on public.alert_rules for select using (auth.role() = 'authenticated');
drop policy if exists "Admin can modify alert rules" on public.alert_rules;
create policy "Admin can modify alert rules" on public.alert_rules for all using (
  exists (select 1 from public.profiles p where p.id::text = auth.uid()::text and p.role = 'admin')
);

drop policy if exists "Users can manage own push subscriptions" on public.push_subscriptions;
create policy "Users can manage own push subscriptions" on public.push_subscriptions for all using (user_id::text = auth.uid()::text);

drop policy if exists "Authenticated users can read webhook configs" on public.webhook_configs;
create policy "Authenticated users can read webhook configs" on public.webhook_configs for select using (auth.role() = 'authenticated');
drop policy if exists "Admin can modify webhook configs" on public.webhook_configs;
create policy "Admin can modify webhook configs" on public.webhook_configs for all using (
  exists (select 1 from public.profiles p where p.id::text = auth.uid()::text and p.role = 'admin')
);

drop policy if exists "Authenticated users can read activity log" on public.activity_log;
create policy "Authenticated users can read activity log" on public.activity_log for select using (auth.role() = 'authenticated');
drop policy if exists "Service role can insert activity log" on public.activity_log;
create policy "Service role can insert activity log" on public.activity_log for insert with check (true);

drop policy if exists "Authenticated users can read daily revenue" on public.daily_revenue;
create policy "Authenticated users can read daily revenue" on public.daily_revenue for select using (auth.role() = 'authenticated');
drop policy if exists "Admin can modify daily revenue" on public.daily_revenue;
create policy "Admin can modify daily revenue" on public.daily_revenue for all using (
  exists (select 1 from public.profiles p where p.id::text = auth.uid()::text and p.role = 'admin')
);

drop policy if exists "Authenticated users can read monthly snapshots" on public.monthly_snapshots;
create policy "Authenticated users can read monthly snapshots" on public.monthly_snapshots for select using (auth.role() = 'authenticated');
drop policy if exists "Admin can modify monthly snapshots" on public.monthly_snapshots;
create policy "Admin can modify monthly snapshots" on public.monthly_snapshots for all using (
  exists (select 1 from public.profiles p where p.id::text = auth.uid()::text and p.role = 'admin')
);

drop policy if exists "Authenticated users can read top products" on public.top_products;
create policy "Authenticated users can read top products" on public.top_products for select using (auth.role() = 'authenticated');
drop policy if exists "Admin can modify top products" on public.top_products;
create policy "Admin can modify top products" on public.top_products for all using (
  exists (select 1 from public.profiles p where p.id::text = auth.uid()::text and p.role = 'admin')
);

drop policy if exists "Authenticated users can read category breakdown" on public.category_breakdown;
create policy "Authenticated users can read category breakdown" on public.category_breakdown for select using (auth.role() = 'authenticated');
drop policy if exists "Admin can modify category breakdown" on public.category_breakdown;
create policy "Admin can modify category breakdown" on public.category_breakdown for all using (
  exists (select 1 from public.profiles p where p.id::text = auth.uid()::text and p.role = 'admin')
);

drop policy if exists "Authenticated users can read return reasons" on public.return_reasons;
create policy "Authenticated users can read return reasons" on public.return_reasons for select using (auth.role() = 'authenticated');
drop policy if exists "Admin can modify return reasons" on public.return_reasons;
create policy "Admin can modify return reasons" on public.return_reasons for all using (
  exists (select 1 from public.profiles p where p.id::text = auth.uid()::text and p.role = 'admin')
);

drop policy if exists "Authenticated users can read vendor performance" on public.vendor_performance;
create policy "Authenticated users can read vendor performance" on public.vendor_performance for select using (auth.role() = 'authenticated');
drop policy if exists "Admin can modify vendor performance" on public.vendor_performance;
create policy "Admin can modify vendor performance" on public.vendor_performance for all using (
  exists (select 1 from public.profiles p where p.id::text = auth.uid()::text and p.role = 'admin')
);

drop policy if exists "Authenticated users can read warehouse performance" on public.warehouse_performance;
create policy "Authenticated users can read warehouse performance" on public.warehouse_performance for select using (auth.role() = 'authenticated');
drop policy if exists "Admin can modify warehouse performance" on public.warehouse_performance;
create policy "Admin can modify warehouse performance" on public.warehouse_performance for all using (
  exists (select 1 from public.profiles p where p.id::text = auth.uid()::text and p.role = 'admin')
);

drop policy if exists "Authenticated users can read notification analytics" on public.notification_analytics;
create policy "Authenticated users can read notification analytics" on public.notification_analytics for select using (auth.role() = 'authenticated');
drop policy if exists "Admin can modify notification analytics" on public.notification_analytics;
create policy "Admin can modify notification analytics" on public.notification_analytics for all using (
  exists (select 1 from public.profiles p where p.id::text = auth.uid()::text and p.role = 'admin')
);

-- Not from a tracked migration (created ad-hoc) — mirrors the existing
-- categories/product_categories "allow all" pattern so the admin categories
-- page keeps working exactly as it does today. Worth tightening later to
-- match the admin/staff pattern used everywhere else.
drop policy if exists "Allow all access to sub_categories" on public.sub_categories;
create policy "Allow all access to sub_categories" on public.sub_categories for all using (true) with check (true);

-- `users` (id/email/password_hash) is not from a tracked migration either —
-- it's written directly by the Express server's own auth code over a
-- privileged direct Postgres connection, which bypasses RLS entirely. It is
-- NEVER read through the Supabase REST API, so intentionally left with RLS
-- enabled and zero policies: that fully blocks anon/authenticated API access
-- to password hashes while leaving the server's direct connection unaffected.
