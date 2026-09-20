-- Drop admin.name.
--
-- Signup asked for a full name before it would accept an email and password.
-- Nothing depended on it: the account is identified by its email, and a clinic's
-- public name is queue_title, which the host sets on the desk afterwards and can
-- change at any time. The field only stood between a doctor and a working desk.
--
-- Order matters here. Both functions that write to public.admin are replaced
-- FIRST, and only then is the column dropped. Done the other way round, any
-- signup landing in between would hit a trigger inserting into a column that no
-- longer exists, and the account creation would fail outright.

-- ── 1. The trigger on auth.users ────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.admin (admin_id, email, status)
  values (new.id, new.email, 'Active')
  on conflict (admin_id) do update
    set email = excluded.email;

  insert into public.usage (admin_id, remaining_tokens)
  values (new.id, 1500)
  on conflict (admin_id) do nothing;

  return new;
end;
$function$;

-- ── 2. The desk bootstrapper, which also back-fills admin rows ──────────────
create or replace function public.ensure_my_desk()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare uid uuid := auth.uid(); q public.queue_details; bal integer; st text; new_slug text; tries int := 0;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  perform pg_advisory_xact_lock(hashtextextended('livequeue:desk:' || uid::text, 0));
  insert into public.admin (admin_id, email)
  select u.id, u.email
    from auth.users u where u.id = uid
  on conflict (admin_id) do nothing;
  insert into public.usage (admin_id, remaining_tokens) values (uid, 1500) on conflict (admin_id) do nothing;
  select * into q from public.queue_details where admin_id = uid order by queue_id limit 1;
  if not found then
    loop
      new_slug := 'desk-' || substr(md5(gen_random_uuid()::text), 1, 6);
      begin
        insert into public.queue_details (admin_id, queue_title, queue_subtitle, slug, queue_position)
        values (uid, 'Counter 1', 'Consultation Desk', new_slug, 0) returning * into q;
        exit;
      exception when unique_violation then
        tries := tries + 1; if tries >= 8 then raise; end if;
      end;
    end loop;
  end if;
  select remaining_tokens into bal from public.usage where admin_id = uid;
  select status into st from public.admin where admin_id = uid;
  return jsonb_build_object('queue', to_jsonb(q), 'remaining_tokens', bal, 'status', st);
end; $function$;

-- ── 3. Now the column is unreferenced and can go ────────────────────────────
alter table public.admin drop column if exists name;
