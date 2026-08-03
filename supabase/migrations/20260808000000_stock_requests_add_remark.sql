-- Freeform remark on a request, distinct from Reason — surfaced in the UI as a
-- select-or-create combobox seeded from remarks already used on other requests.
alter table public.stock_requests add column if not exists remark text;
