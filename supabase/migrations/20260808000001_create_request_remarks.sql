-- Reusable catalog of Remark values for stock requests, so a remark typed once
-- (via the Remark combobox's "type new + Enter" flow) stays selectable for every
-- future request from then on — not just for requests that were actually saved
-- while it lived in that page session's memory.
create table if not exists public.request_remarks (
  value text primary key,
  created_at timestamptz not null default now()
);

alter table public.request_remarks enable row level security;

create policy "Authenticated users can read remarks" on public.request_remarks
  for select using (auth.role() = 'authenticated');

create policy "Authenticated users can add remarks" on public.request_remarks
  for insert with check (auth.role() = 'authenticated');
