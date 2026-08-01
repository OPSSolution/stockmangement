-- Teams gets a "Delete" toggle in Edit Role (removing a member), matching
-- how canDelete('teams') is already checked in the Teams page UI. Member
-- removal is a soft delete (profiles.deleted_at set via UPDATE, not an
-- actual DELETE), so the profiles UPDATE policy needs to also accept the
-- teams delete permission, not just teams edit.
create or replace function public.current_user_can_delete_page(page_key text)
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
         when 'object' then (r.permissions -> page_key ->> 'delete')::boolean
         else false
       end)
     from public.profiles p
     join public.roles r on r.id = p.role
     where p.id = auth.uid()),
    false
  );
$$;

drop policy if exists "Admins can update all profiles" on public.profiles;
create policy "Admins can update all profiles" on public.profiles for update using (
  public.current_user_is_full_access()
  or public.current_user_can_edit_page('teams')
  or public.current_user_can_delete_page('teams')
);
