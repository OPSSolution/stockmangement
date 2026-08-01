-- The "New Vendor" button is now shown to every role, but the vendors table's
-- RLS policy still gated INSERT behind the vendors.edit permission (same
-- "for all" policy also covering UPDATE/DELETE). Split it so creating a
-- vendor is open to any authenticated user, while updating/deleting still
-- requires full access or the vendors.edit permission.

drop policy if exists "Staff and admin can modify vendors" on public.vendors;

create policy "Authenticated users can create vendors" on public.vendors for insert
  with check (auth.role() = 'authenticated');

create policy "Staff and admin can update vendors" on public.vendors for update using (
  exists (select 1 from public.profiles p join public.roles r on r.id = p.role where p.id = auth.uid() and (r.is_full_access = true or (r.permissions->'vendors'->>'edit')::boolean = true))
);

create policy "Staff and admin can delete vendors" on public.vendors for delete using (
  exists (select 1 from public.profiles p join public.roles r on r.id = p.role where p.id = auth.uid() and (r.is_full_access = true or (r.permissions->'vendors'->>'edit')::boolean = true))
);
