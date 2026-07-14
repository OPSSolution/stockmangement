-- New notification types: submitting a Stock Request, creating a Delivery, or
-- creating a Transfer now notify admins the same way a new Order already did.
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('low_stock', 'out_of_stock', 'new_order', 'new_request', 'new_delivery', 'new_transfer', 'return_pending', 'transfer_ready', 'delivery_delayed', 'system'));
