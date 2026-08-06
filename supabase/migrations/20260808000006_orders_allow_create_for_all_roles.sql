-- Allow every authenticated role to create orders, while keeping update/delete restricted
-- to roles with order edit permissions or full access.

drop policy if exists "Staff and admin can modify orders" on public.orders;

create policy "Authenticated users can create orders" on public.orders for insert
  with check (auth.role() = 'authenticated');

create policy "Staff and admin can update orders" on public.orders for update using (
  exists (select 1 from public.profiles p join public.roles r on r.id = p.role where p.id = auth.uid() and (r.is_full_access = true or (r.permissions->'orders'->>'edit')::boolean = true))
);

create policy "Staff and admin can delete orders" on public.orders for delete using (
  exists (select 1 from public.profiles p join public.roles r on r.id = p.role where p.id = auth.uid() and (r.is_full_access = true or (r.permissions->'orders'->>'edit')::boolean = true))
);
