-- Team members can now be assigned to more than one warehouse. The old
-- single `warehouse` column is kept as-is (unused going forward) so no
-- historical data is lost; `warehouses` is the new source of truth and is
-- backfilled from it.
alter table public.profiles add column if not exists warehouses text[] not null default '{}';

update public.profiles
set warehouses = array[warehouse]
where warehouse is not null and warehouses = '{}';
