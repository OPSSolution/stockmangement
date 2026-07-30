-- The "Admins can read/update all profiles" policies query `profiles` from
-- within a policy defined ON `profiles` itself — a self-reference that can
-- trigger Postgres's recursion protection (surfaced as a 500 from PostgREST,
-- confirmed happening on every profile fetch after the previous migration).
-- Fix: look up is_full_access through a SECURITY DEFINER function, which
-- runs with elevated privileges and bypasses RLS internally, so it never
-- re-triggers policy evaluation on profiles.
create or replace function public.current_user_is_full_access()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select r.is_full_access
     from public.profiles p
     join public.roles r on r.id = p.role
     where p.id = auth.uid()),
    false
  );
$$;

drop policy if exists "Admins can read all profiles" on public.profiles;
create policy "Admins can read all profiles" on public.profiles for select using (
  public.current_user_is_full_access()
);

drop policy if exists "Admins can update all profiles" on public.profiles;
create policy "Admins can update all profiles" on public.profiles for update using (
  public.current_user_is_full_access()
);

-- Same recursion risk on "Admin can modify roles" — it's a policy on `roles`
-- that also queries `roles`. General-purpose version of the helper above so
-- it can also check a specific page's edit permission (needed here since
-- modifying roles isn't full-access-only, per-role edit access is allowed).
create or replace function public.current_user_can_edit_page(page_key text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select r.is_full_access or (r.permissions->page_key->>'edit')::boolean
     from public.profiles p
     join public.roles r on r.id = p.role
     where p.id = auth.uid()),
    false
  );
$$;

drop policy if exists "Admin can modify roles" on public.roles;
create policy "Admin can modify roles" on public.roles for all using (
  public.current_user_can_edit_page('roles')
);
