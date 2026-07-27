-- ============================================================
-- Collapse the two-table Purchase Request / Purchase Order split into a
-- single "Purchase Order" record that carries the full lifecycle itself:
-- pending -> approved -> ordered -> received (or rejected/cancelled along
-- the way). There is no longer a separate pre-approval table that spawns a
-- second row on approval — the same row goes through the whole thing.
--
-- Existing data in both tables is test data and is fine to drop (per
-- explicit confirmation) rather than migrated.
--
-- The new `purchases.id` adopts the same DB-generated identity pattern
-- purchase_requests used (atomic, gapless per insert, no client-side race),
-- just with the PO- prefix and 2-digit padding.
-- ============================================================

drop table if exists public.purchase_requests cascade;
drop table if exists public.purchases cascade;

create table public.purchases (
  po_no integer generated always as identity,
  id text generated always as ('PO-' || lpad(po_no::text, 2, '0')) stored primary key,
  vendor text not null,
  vendor_contact text,
  vendor_email text,
  warehouse text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled', 'ordered', 'received')),
  items jsonb not null default '[]'::jsonb,
  total_items integer not null default 0,
  subtotal numeric(12,2) not null default 0,
  tax numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  reason text,
  requested_by text not null,
  submitted_by text,
  review_note text,
  approved_by text,
  approved_at text,
  notes text,
  expected_delivery text,
  received_at text,
  receipt_document_url text,
  receipt_document_name text,
  created_at text not null default to_char(now(), 'YYYY-MM-DD HH24:MI'),
  updated_at text not null default to_char(now(), 'YYYY-MM-DD HH24:MI')
);
alter table public.purchases enable row level security;
create policy "Authenticated users can read purchases" on public.purchases for select using (auth.role() = 'authenticated');
create policy "Staff and admin can modify purchases" on public.purchases for all using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
);
