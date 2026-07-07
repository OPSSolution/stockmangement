-- profiles/notification_settings were created against a leftover local-auth
-- schema (database/schema.sql), so their id columns are TEXT referencing a
-- private `users` table instead of Supabase's real `auth.users` (uuid). That
-- meant every real Supabase-created login could never satisfy the FK check —
-- not a timing issue, a wrong-table issue. This repoints both at auth.users.

-- 1. Drop the old, wrong foreign keys.
alter table public.profiles drop constraint if exists profiles_id_fkey;
alter table public.notification_settings drop constraint if exists notification_settings_user_id_fkey;

-- 2. Remove the demo rows that were never real logins.
delete from public.notification_settings where user_id in ('USR-001', 'USR-002', 'USR-003');
delete from public.profiles where id in ('USR-001', 'USR-002', 'USR-003');

-- 3. Re-point the one real row (honsreyka6@gmail.com) at its actual Supabase
-- Auth id, so it's finally the row the logged-in session actually matches.
update public.notification_settings set user_id = 'db2b75a3-a7b1-4563-9746-0f1da7778981' where user_id = 'USR-004';
update public.profiles set id = 'db2b75a3-a7b1-4563-9746-0f1da7778981' where id = 'USR-004';

-- 4. Convert the id columns from text to uuid now that every value is a
-- genuine uuid.
alter table public.profiles alter column id type uuid using id::uuid;
alter table public.notification_settings alter column user_id type uuid using user_id::uuid;

-- 5. Add the correct foreign keys, pointing at Supabase's real auth.users.
alter table public.profiles
  add constraint profiles_id_fkey foreign key (id) references auth.users(id) on delete cascade;
alter table public.notification_settings
  add constraint notification_settings_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;

-- 6. These tables never had RLS turned on (a real gap — the public anon key
-- could read every profile). Lock them down the same way the rest of the app
-- already expects (matches supabase/migrations/20260608000000_initial_schema.sql).
alter table public.profiles enable row level security;
drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile" on public.profiles for select using (auth.uid() = id);
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);
drop policy if exists "Allow insert during signup" on public.profiles;
create policy "Allow insert during signup" on public.profiles for insert with check (auth.uid() = id);
drop policy if exists "Admins can read all profiles" on public.profiles;
create policy "Admins can read all profiles" on public.profiles for select using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);
drop policy if exists "Admins can update all profiles" on public.profiles;
create policy "Admins can update all profiles" on public.profiles for update using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

alter table public.notification_settings enable row level security;
drop policy if exists "Users can manage own notification settings" on public.notification_settings;
create policy "Users can manage own notification settings" on public.notification_settings for all using (user_id = auth.uid());
