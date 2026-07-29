-- The Stock Receives page ships with a new 'stock_receives' permission key,
-- but every existing role's permissions JSON predates it — so it defaults to
-- hidden for everyone, including admin. Grant it to admin/staff by default,
-- matching how 'purchases' is already configured for those two roles.
UPDATE public.roles
SET permissions = permissions || '{"stock_receives": true}'::jsonb
WHERE id IN ('admin', 'staff');
