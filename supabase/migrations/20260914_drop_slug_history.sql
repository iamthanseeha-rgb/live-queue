-- Slugs are simply free once released.
--
-- Previously a rename wrote the old slug into slug_history and get_public_queue
-- fell back to it, so an old QR poster kept working. That fallback only held
-- while nobody else claimed the released name, and it was one more moving part
-- to maintain and explain.
--
-- A rename now does nothing but change the slug: no history, no redirect, no
-- reservation. The old link stops working immediately, and another desk may
-- claim it later. The trade-off is deliberate -- a clinic that renames prints a
-- new QR poster and takes the old one off the wall.
--
-- get_public_queue already looks only at live desks, so it needs no change.

drop trigger if exists queue_details_guard_slug on public.queue_details;
drop trigger if exists queue_details_track_slug on public.queue_details;

drop function if exists public.guard_slug_not_retired();
drop function if exists public.track_slug_change();

drop table if exists public.retired_slugs;   -- was slug_history

-- For the record, the shape get_public_queue now has: live desks only, null
-- otherwise. Re-stated here so this file reads as the complete end state.
create or replace function public.get_public_queue(p_slug text)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare r record;
begin
  select queue_id, public_key, queue_title, queue_subtitle, slug, queue_position, updated_at
    into r from public.queue_details where slug = lower(p_slug);
  if not found then return null; end if;
  return to_jsonb(r);
end; $function$;
