-- Stock Receives (and Transfers, Returns, Purchases, Orders, request
-- fulfillment — everything routed through src/lib/stockDeduction.ts) all
-- write to product_warehouse_stock as the final step of their own flow, but
-- its RLS policy only ever checked the 'inventory' page's edit permission,
-- not the permission of the module actually doing the write. A role with
-- e.g. stock_receives.edit = true but inventory.edit = false could log a
-- stock receive (stock_receives insert succeeds) while the matching
-- inventory update silently failed RLS, leaving the receive recorded but
-- stock never actually incremented.
--
-- product_warehouse_stock is a shared derived-stock table, not a page with
-- its own permission toggle — same situation as stock_history and
-- product_bin_stock, both of which already use "allow all" for this reason.
-- Bring product_warehouse_stock in line with them; real authorization for
-- *initiating* a stock movement still happens at each module's own
-- create/edit permission and RLS (stock_receives, transfers, returns, etc.).
drop policy if exists "Staff and admin can modify product_warehouse_stock" on public.product_warehouse_stock;

create policy "Authenticated users can modify product_warehouse_stock" on public.product_warehouse_stock for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
