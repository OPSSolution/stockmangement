-- ============================================================
-- PURCHASE REQUESTS — pre-approval stage ahead of a Purchase Order.
-- `pr_no` is a real DB-generated identity column (atomic, gapless per
-- successful insert, no client-side race like the PO/REQ id schemes
-- elsewhere) and `id` is derived straight from it, e.g. PR-00001 —
-- the sequence number the approval sign-off refers to.
-- ============================================================
create table public.purchase_requests (
  pr_no integer generated always as identity,
  id text generated always as ('PR-' || lpad(pr_no::text, 5, '0')) stored primary key,
  vendor text not null,
  vendor_contact text,
  vendor_email text,
  warehouse text not null,
  items jsonb not null default '[]'::jsonb,
  total_items integer not null default 0,
  estimated_total numeric(12,2) not null default 0,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  requested_by text not null,
  submitted_by text not null,
  review_note text,
  approved_by text,
  approved_at timestamptz,
  purchase_order_id text references public.purchases(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.purchase_requests enable row level security;
create policy "Authenticated users can read purchase requests" on public.purchase_requests for select using (auth.role() = 'authenticated');
create policy "Staff and admin can modify purchase requests" on public.purchase_requests for all using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
);

-- Traces an approved PO back to the request it was auto-created from.
alter table public.purchases add column if not exists purchase_request_id text references public.purchase_requests(id);
