-- Replaces the hardcoded "role === 'admin'" concept used throughout the app
-- (warehouse-scope bypass, admin-only notifications, etc.) with a per-role
-- flag settable from the Roles page — so any role, not just one literally
-- named 'admin', can be the "sees/acts on everything" role.
alter table public.roles add column if not exists is_full_access boolean not null default false;

-- Preserve current behavior for the existing admin role, and pre-set it for
-- the user's new designated full-access role so no extra manual step is
-- needed after this ships.
update public.roles set is_full_access = true where id = 'admin';
update public.roles set is_full_access = true where id = 'manager';
