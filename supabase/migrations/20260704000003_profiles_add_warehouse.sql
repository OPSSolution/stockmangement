-- Ties a team member to the warehouse they work at, so delivery status actions
-- can be restricted to the sending/receiving warehouse's own people (admins
-- always retain full override via the existing role check).
alter table public.profiles add column if not exists warehouse text;
