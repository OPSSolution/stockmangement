-- profiles.role was locked to a fixed 3-value check constraint
-- ('admin' | 'staff' | 'viewer'), predating the `roles` table that now lets
-- admins define custom roles from the Roles page. Replace it with a foreign
-- key into roles(id) instead — any role that exists can be assigned, and the
-- FK still protects against typos/nonexistent role ids (and blocks deleting
-- a role that's currently assigned to a team member).
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles drop constraint if exists profiles_role_fkey;
alter table public.profiles add constraint profiles_role_fkey foreign key (role) references public.roles(id);
