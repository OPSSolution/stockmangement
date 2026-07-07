-- Deliveries used to model "shipment to a customer" (customer/order_id required,
-- destination = person name). Reworking it to model a physical shipment moving
-- stock from one warehouse to another, so the columns the form already relies on
-- (transfer/driver/vehicle/timeline) actually exist, and the old customer-only
-- columns stop being mandatory.

alter table public.deliveries alter column customer drop not null;
alter table public.deliveries alter column order_id drop not null;

alter table public.deliveries add column if not exists from_warehouse text;
alter table public.deliveries add column if not exists to_warehouse text;
alter table public.deliveries add column if not exists transfer_id text;
alter table public.deliveries add column if not exists items_detail jsonb not null default '[]';
alter table public.deliveries add column if not exists timeline jsonb not null default '[]';
alter table public.deliveries add column if not exists warehouse text;
alter table public.deliveries add column if not exists estimated_delivery text;
alter table public.deliveries add column if not exists driver_name text;
alter table public.deliveries add column if not exists vehicle_plate text;
alter table public.deliveries add column if not exists departure_time text;
alter table public.deliveries add column if not exists arrival_time text;
alter table public.deliveries add column if not exists image_url text;
