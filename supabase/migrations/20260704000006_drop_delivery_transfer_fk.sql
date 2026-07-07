-- deliveries.transfer_id is a cosmetic label auto-generated client-side
-- (DeliveryFormModal's autoTransferId) — it was never meant to reference a
-- real row in `transfers` (deliveries and transfers are independent features
-- in this app). The FK constraint (added out-of-band, not by any tracked
-- migration) rejects every delivery creation since the generated label never
-- matches an existing transfer.
alter table public.deliveries drop constraint if exists fk_delivery_transfer;
