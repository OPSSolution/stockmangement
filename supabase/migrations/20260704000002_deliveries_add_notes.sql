-- General free-text remarks on a delivery (parity with transfers.notes), separate
-- from the per-timeline-event note captured at each status change.
alter table public.deliveries add column if not exists notes text;
