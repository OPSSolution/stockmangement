-- notifications.user_id was left pointing at the legacy local-auth `users`
-- table (text ids like 'USR-001', from database/schema.sql) when
-- 20260704000005_fix_profiles_reference_real_auth.sql repointed
-- profiles/notification_settings at Supabase's real auth.users but missed this
-- table — so every notify-admins insert with a real Supabase auth id has been
-- failing notifications_user_id_fkey ever since. Table is empty, so this is a
-- straightforward repoint, same fix as the earlier migration.
-- RLS policies on this table read user_id, which blocks ALTER COLUMN TYPE
-- outright — drop them first, convert the column, then recreate them as they
-- were (matching the uuid-cast form from 20260730000001_restore_rls_policies.sql).
drop policy if exists "Users can read own notifications" on public.notifications;
drop policy if exists "Users can update own notifications" on public.notifications;
drop policy if exists "Users can delete own notifications" on public.notifications;
drop policy if exists "Service role can insert notifications" on public.notifications;

alter table public.notifications drop constraint if exists notifications_user_id_fkey;
alter table public.notifications alter column user_id type uuid using user_id::uuid;
alter table public.notifications
  add constraint notifications_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;

create policy "Users can read own notifications" on public.notifications for select using (user_id = auth.uid());
create policy "Users can update own notifications" on public.notifications for update using (user_id = auth.uid());
create policy "Users can delete own notifications" on public.notifications for delete using (user_id = auth.uid());
create policy "Service role can insert notifications" on public.notifications for insert with check (true);
