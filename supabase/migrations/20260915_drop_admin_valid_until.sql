-- Drop admin.valid_until.
--
-- The column defaulted to CURRENT_DATE + 30 days on signup and was never read
-- again: no reference in the app, in any migration, or in any database
-- function. It is a leftover from a subscription model that LiveQueue moved
-- away from -- hosts are charged per "next token" call, so there is no clock
-- on an account at all.
--
-- Removed rather than left in place because it reads as authoritative. Anyone
-- later adding "expiry" logic around it would lock out paying customers whose
-- accounts never actually expire.

alter table public.admin drop column if exists valid_until;
