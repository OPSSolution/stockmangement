-- Creating a Supabase Auth user and then immediately inserting its `profiles`
-- row from a separate request was consistently hitting profiles_id_fkey, even
-- after several retries — the two operations don't share a transaction, so
-- there's no guarantee PostgREST sees the just-created auth.users row yet.
-- Standard fix: a trigger on auth.users that creates the profiles row in the
-- SAME transaction as the user itself, so it's never out of sync.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role, phone)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email, 'User'),
    coalesce(new.raw_user_meta_data->>'role', 'staff'),
    new.raw_user_meta_data->>'phone'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();
