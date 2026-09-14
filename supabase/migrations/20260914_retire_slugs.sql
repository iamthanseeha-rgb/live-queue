-- Retire slugs instead of redirecting them.
--
-- Old behaviour: renaming a desk wrote the old slug into slug_history, and
-- get_public_queue fell back to that table so old QR posters kept working.
-- The hole: a released slug could still be claimed by a DIFFERENT clinic, and
-- the old poster then resolved to that clinic's live queue -- a confidently
-- wrong token number in someone else's waiting room.
--
-- New behaviour: a slug is used once. Rename and the old name is retired for
-- good. Nobody else can take it, and the old link reports that no queue exists
-- there. A clinic that renames prints a new QR poster. No redirect to maintain.

alter table public.slug_history rename to retired_slugs;
alter table public.retired_slugs rename column changed_at to retired_at;

comment on table public.retired_slugs is
  'Slugs a desk has moved away from. Never reissued to any desk, so an old QR poster can never resolve to a different clinic. Not a redirect table: get_public_queue does not read it.';

-- ── Retire the name being left behind ──────────────────────────────────────
create or replace function public.track_slug_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.slug is distinct from old.slug then
    -- First retirer keeps ownership. If a row somehow already exists we leave
    -- it alone rather than reassigning the name to a newer desk.
    insert into public.retired_slugs (slug, queue_id)
    values (old.slug, old.queue_id)
    on conflict (slug) do nothing;

    -- This desk is moving back onto one of its own retired names, so that name
    -- is live again and must leave the retired list.
    delete from public.retired_slugs
     where slug = new.slug and queue_id = new.queue_id;
  end if;
  return new;
end; $function$;

-- ── Refuse a retired name ──────────────────────────────────────────────────
-- Raises unique_violation (23505) deliberately: ensure_my_desk's retry loop
-- and the dashboard's "isn't available" message both already handle that code.
create or replace function public.guard_slug_not_retired()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare owner_id bigint;
begin
  select queue_id into owner_id from public.retired_slugs where slug = new.slug;
  if not found then return new; end if;

  -- A brand-new desk can never own a retired slug. An existing desk may move
  -- back onto a name it retired itself.
  if tg_op = 'UPDATE' and owner_id = new.queue_id then
    return new;
  end if;

  raise exception using
    errcode = '23505',
    message = format('The link "/%s" is no longer available.', new.slug);
end; $function$;

-- Fires before queue_details_track_slug (BEFORE triggers run in name order,
-- and 'g' sorts before 't'), so a rejected name is never also retired.
drop trigger if exists queue_details_guard_slug on public.queue_details;
create trigger queue_details_guard_slug
  before insert or update of slug on public.queue_details
  for each row execute function public.guard_slug_not_retired();

-- ── No more redirect fallback ──────────────────────────────────────────────
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
