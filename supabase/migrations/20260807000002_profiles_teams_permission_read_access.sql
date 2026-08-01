-- Toggling "Teams" on for a role in Edit Role only ever controlled whether
-- the Teams nav item/page showed up in the app — the underlying profiles
-- RLS policy still only let is_full_access roles actually read (or update)
-- every team member. Any other role landed on the Teams page but, per
-- "Users can read own profile", saw just their own single row.
--
-- SECURITY DEFINER (not a plain subquery) for the same reason as
-- current_user_is_full_access() / current_user_can_edit_page(): a policy on
-- profiles that queries profiles from within itself trips Postgres's
-- recursion guard.
create or replace function public.current_user_can_view_page(page_key text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select r.is_full_access or (
       case jsonb_typeof(r.permissions -> page_key)
         when 'boolean' then (r.permissions ->> page_key)::boolean
         when 'object' then (r.permissions -> page_key ->> 'view')::boolean
         else false
       end)
     from public.profiles p
     join public.roles r on r.id = p.role
     where p.id = auth.uid()),
    false
  );
$$;

drop policy if exists "Admins can read all profiles" on public.profiles;
create policy "Admins can read all profiles" on public.profiles for select using (
  public.current_user_can_view_page('teams')
);

drop policy if exists "Admins can update all profiles" on public.profiles;
create policy "Admins can update all profiles" on public.profiles for update using (
  public.current_user_is_full_access() or public.current_user_can_edit_page('teams')
);
