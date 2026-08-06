-- New orders now get a clean, human-readable ORD-01, ORD-02... id instead of
-- the old ORD-<timestamp> scheme. A dedicated sequence rather than deriving
-- "max existing id + 1" client-side — existing ids are a mix of old timestamp-
-- and mock-based values in no consistent format, so scanning them wouldn't
-- start cleanly at 1, and a sequence is race-safe against concurrent creates
-- in a way a client-side max-scan isn't. Existing orders keep their current
-- ids untouched; this only affects orders created from now on.
create sequence if not exists public.orders_order_no_seq;

create or replace function public.next_order_id()
returns text
language sql
as $$
  select 'ORD-' || lpad(nextval('public.orders_order_no_seq')::text, 2, '0');
$$;

-- Granted to anon too, not just authenticated — the customer-facing public
-- order form (src/pages/order-form/page.tsx) creates orders with no logged-in
-- user, same reasoning as notify-admins being unauthenticated.
grant execute on function public.next_order_id() to anon, authenticated;
