-- The app-level "remove hardcoded admin" refactor (isFullAccess, canApprove,
-- etc.) missed that many tables ALSO enforce `role = 'admin'` / `role in
-- ('admin','staff')` directly in their own Postgres RLS policies — a
-- completely separate mechanism from the app's JS permission checks. Since
-- the account that used to be 'admin' is now 'manager', every one of these
-- policies started silently blocking reads/writes for it. This replaces all
-- of them with a check against roles.is_full_access (and, for the tables
-- that map to a real page in the permissions model, that page's 'edit' flag
-- too) so custom roles work at the database level, not just in the UI.

-- profiles: seeing/managing the whole team is a full-access capability.
drop policy if exists "Admins can read all profiles" on public.profiles;
create policy "Admins can read all profiles" on public.profiles for select using (
  exists (select 1 from public.profiles p join public.roles r on r.id = p.role where p.id = auth.uid() and r.is_full_access = true)
);
drop policy if exists "Admins can update all profiles" on public.profiles;
create policy "Admins can update all profiles" on public.profiles for update using (
  exists (select 1 from public.profiles p join public.roles r on r.id = p.role where p.id = auth.uid() and r.is_full_access = true)
);

-- roles: only used via the server's service-role client today (bypasses RLS
-- entirely), but fixed for consistency / in case that ever changes.
drop policy if exists "Admin can modify roles" on public.roles;
create policy "Admin can modify roles" on public.roles for all using (
  exists (select 1 from public.profiles p join public.roles r on r.id = p.role where p.id = auth.uid() and (r.is_full_access = true or (r.permissions->'roles'->>'edit')::boolean = true))
);

-- Tables with a real page in the permissions model: full-access OR that
-- page's edit permission.
drop policy if exists "Staff and admin can modify products" on public.products;
create policy "Staff and admin can modify products" on public.products for all using (
  exists (select 1 from public.profiles p join public.roles r on r.id = p.role where p.id = auth.uid() and (r.is_full_access = true or (r.permissions->'inventory'->>'edit')::boolean = true))
);

drop policy if exists "Admin can modify warehouses" on public.warehouses;
create policy "Admin can modify warehouses" on public.warehouses for all using (
  exists (select 1 from public.profiles p join public.roles r on r.id = p.role where p.id = auth.uid() and (r.is_full_access = true or (r.permissions->'warehouses'->>'edit')::boolean = true))
);

drop policy if exists "Staff and admin can modify vendors" on public.vendors;
create policy "Staff and admin can modify vendors" on public.vendors for all using (
  exists (select 1 from public.profiles p join public.roles r on r.id = p.role where p.id = auth.uid() and (r.is_full_access = true or (r.permissions->'vendors'->>'edit')::boolean = true))
);

drop policy if exists "Staff and admin can modify purchases" on public.purchases;
create policy "Staff and admin can modify purchases" on public.purchases for all using (
  exists (select 1 from public.profiles p join public.roles r on r.id = p.role where p.id = auth.uid() and (r.is_full_access = true or (r.permissions->'purchases'->>'edit')::boolean = true))
);

drop policy if exists "Staff and admin can modify orders" on public.orders;
create policy "Staff and admin can modify orders" on public.orders for all using (
  exists (select 1 from public.profiles p join public.roles r on r.id = p.role where p.id = auth.uid() and (r.is_full_access = true or (r.permissions->'orders'->>'edit')::boolean = true))
);

drop policy if exists "Staff and admin can modify deliveries" on public.deliveries;
create policy "Staff and admin can modify deliveries" on public.deliveries for all using (
  exists (select 1 from public.profiles p join public.roles r on r.id = p.role where p.id = auth.uid() and (r.is_full_access = true or (r.permissions->'deliveries'->>'edit')::boolean = true))
);

drop policy if exists "Staff and admin can modify transfers" on public.transfers;
create policy "Staff and admin can modify transfers" on public.transfers for all using (
  exists (select 1 from public.profiles p join public.roles r on r.id = p.role where p.id = auth.uid() and (r.is_full_access = true or (r.permissions->'transfers'->>'edit')::boolean = true))
);

drop policy if exists "Staff and admin can modify returns" on public.returns;
create policy "Staff and admin can modify returns" on public.returns for all using (
  exists (select 1 from public.profiles p join public.roles r on r.id = p.role where p.id = auth.uid() and (r.is_full_access = true or (r.permissions->'returns'->>'edit')::boolean = true))
);

drop policy if exists "Staff and admin can insert stock history" on public.stock_history;
create policy "Staff and admin can insert stock history" on public.stock_history for insert with check (
  exists (select 1 from public.profiles p join public.roles r on r.id = p.role where p.id = auth.uid() and (r.is_full_access = true or (r.permissions->'inventory'->>'edit')::boolean = true))
);

drop policy if exists "Staff and admin can modify stock_receives" on public.stock_receives;
create policy "Staff and admin can modify stock_receives" on public.stock_receives for all using (
  exists (select 1 from public.profiles p join public.roles r on r.id = p.role where p.id = auth.uid() and (r.is_full_access = true or (r.permissions->'stock_receives'->>'edit')::boolean = true))
);

drop policy if exists "Staff and admin can modify product_warehouse_stock" on public.product_warehouse_stock;
create policy "Staff and admin can modify product_warehouse_stock" on public.product_warehouse_stock for all using (
  exists (select 1 from public.profiles p join public.roles r on r.id = p.role where p.id = auth.uid() and (r.is_full_access = true or (r.permissions->'inventory'->>'edit')::boolean = true))
);

-- Tables with no equivalent page in the permissions model (analytics/report
-- data, alert/webhook configuration): full-access only, same as before.
drop policy if exists "Admin can modify requirements" on public.requirements;
create policy "Admin can modify requirements" on public.requirements for all using (
  exists (select 1 from public.profiles p join public.roles r on r.id = p.role where p.id = auth.uid() and (r.is_full_access = true or (r.permissions->'requirements'->>'edit')::boolean = true))
);

drop policy if exists "Admin can modify promotions" on public.promotions;
create policy "Admin can modify promotions" on public.promotions for all using (
  exists (select 1 from public.profiles p join public.roles r on r.id = p.role where p.id = auth.uid() and r.is_full_access = true)
);

drop policy if exists "Admin can modify alert rules" on public.alert_rules;
create policy "Admin can modify alert rules" on public.alert_rules for all using (
  exists (select 1 from public.profiles p join public.roles r on r.id = p.role where p.id = auth.uid() and r.is_full_access = true)
);

drop policy if exists "Admin can modify webhook configs" on public.webhook_configs;
create policy "Admin can modify webhook configs" on public.webhook_configs for all using (
  exists (select 1 from public.profiles p join public.roles r on r.id = p.role where p.id = auth.uid() and r.is_full_access = true)
);

drop policy if exists "Admin can modify daily revenue" on public.daily_revenue;
create policy "Admin can modify daily revenue" on public.daily_revenue for all using (
  exists (select 1 from public.profiles p join public.roles r on r.id = p.role where p.id = auth.uid() and r.is_full_access = true)
);

drop policy if exists "Admin can modify monthly snapshots" on public.monthly_snapshots;
create policy "Admin can modify monthly snapshots" on public.monthly_snapshots for all using (
  exists (select 1 from public.profiles p join public.roles r on r.id = p.role where p.id = auth.uid() and r.is_full_access = true)
);

drop policy if exists "Admin can modify top products" on public.top_products;
create policy "Admin can modify top products" on public.top_products for all using (
  exists (select 1 from public.profiles p join public.roles r on r.id = p.role where p.id = auth.uid() and r.is_full_access = true)
);

drop policy if exists "Admin can modify category breakdown" on public.category_breakdown;
create policy "Admin can modify category breakdown" on public.category_breakdown for all using (
  exists (select 1 from public.profiles p join public.roles r on r.id = p.role where p.id = auth.uid() and r.is_full_access = true)
);

drop policy if exists "Admin can modify return reasons" on public.return_reasons;
create policy "Admin can modify return reasons" on public.return_reasons for all using (
  exists (select 1 from public.profiles p join public.roles r on r.id = p.role where p.id = auth.uid() and r.is_full_access = true)
);

drop policy if exists "Admin can modify vendor performance" on public.vendor_performance;
create policy "Admin can modify vendor performance" on public.vendor_performance for all using (
  exists (select 1 from public.profiles p join public.roles r on r.id = p.role where p.id = auth.uid() and r.is_full_access = true)
);

drop policy if exists "Admin can modify warehouse performance" on public.warehouse_performance;
create policy "Admin can modify warehouse performance" on public.warehouse_performance for all using (
  exists (select 1 from public.profiles p join public.roles r on r.id = p.role where p.id = auth.uid() and r.is_full_access = true)
);

drop policy if exists "Admin can modify notification analytics" on public.notification_analytics;
create policy "Admin can modify notification analytics" on public.notification_analytics for all using (
  exists (select 1 from public.profiles p join public.roles r on r.id = p.role where p.id = auth.uid() and r.is_full_access = true)
);
